/**
 * Perception and actuation against a live page.
 *
 * Everything a persona is allowed to see is built here, and everything a persona is
 * allowed to do is dispatched here. The persona's capability flags are checked in
 * this file, which is what makes the constraints real rather than advisory: the
 * assistive persona has no code path to a pointer click, so it cannot take one.
 */

import type { PageHandle } from "./browserSession.js";
import {
  announce,
  renderReadingOrder,
  resolveRefToObjectId,
  snapshotAxTree,
  type AxSnapshot,
} from "./axtree.js";
import type { Action, ActionName, Observation, Persona, SuccessAssertion } from "./types.js";

/** Virtual key codes CDP needs for synthetic key events. */
const KEYS: Record<string, { code: string; key: string; vk: number; text?: string }> = {
  Tab: { code: "Tab", key: "Tab", vk: 9 },
  Enter: { code: "Enter", key: "Enter", vk: 13, text: "\r" },
  Space: { code: "Space", key: " ", vk: 32, text: " " },
  Escape: { code: "Escape", key: "Escape", vk: 27 },
  ArrowUp: { code: "ArrowUp", key: "ArrowUp", vk: 38 },
  ArrowDown: { code: "ArrowDown", key: "ArrowDown", vk: 40 },
  ArrowLeft: { code: "ArrowLeft", key: "ArrowLeft", vk: 37 },
  ArrowRight: { code: "ArrowRight", key: "ArrowRight", vk: 39 },
  Home: { code: "Home", key: "Home", vk: 36 },
  End: { code: "End", key: "End", vk: 35 },
  Backspace: { code: "Backspace", key: "Backspace", vk: 8 },
};

export class ActionRefused extends Error {}

/**
 * Roles each quick-navigation key targets, mirroring NVDA and JAWS single-key
 * navigation (H for heading, B for button, K for link, F for form field, D for
 * landmark) and the VoiceOver rotor.
 */
const QUICK_NAV_ROLES: Record<string, string[]> = {
  next_heading: ["heading"],
  next_button: ["button"],
  next_link: ["link"],
  next_form_field: ["textbox", "searchbox", "combobox", "checkbox", "radio", "listbox", "spinbutton", "slider", "switch"],
  next_landmark: ["banner", "navigation", "main", "complementary", "contentinfo", "region", "search", "form"],
};

/**
 * Move focus to the next node of a given role class, wrapping around the document.
 *
 * This is a genuine capability of the assistive technology being modelled, not a
 * shortcut for the model's benefit. Leaving it out would force a naive tab loop and
 * make every site look worse than it is, which would be a measurement error in our
 * favour and therefore the worst kind.
 *
 * It does not leak any information the persona should not have: a control with no
 * accessible name is still reached with no accessible name.
 */
async function quickNav(
  page: PageHandle,
  stale: AxSnapshot,
  action: ActionName,
): Promise<{ ref?: number; error?: string }> {
  const roles = QUICK_NAV_ROLES[action];
  if (!roles) return { error: `Unsupported quick navigation: ${action}` };

  // Resolve against a tree read now, not the one the model was shown.
  //
  // On a single page application the DOM mutates constantly: a toast appears, a
  // route transition swaps a subtree, and the refs in the snapshot the model saw
  // already point somewhere else. Pointed at a real storefront this made next_button
  // oscillate between two nodes forever, one of which was a transient "Close toast"
  // control and the other a search box. Re-reading costs one round trip and removes
  // the whole class of failure.
  const snapshot = await snapshotAxTree(page);
  const roleSet = new Set(roles);
  const from = snapshot.focusedRef ?? stale.focusedRef ?? -1;

  const matches = snapshot.nodes.filter((n) => roleSet.has(n.role.toLowerCase()));
  if (matches.length === 0) {
    return { error: `No ${action.replace("next_", "")} on this page.` };
  }

  const next = matches.find((n) => n.ref > from) ?? matches[0]!;

  const backendNodeId = snapshot.backendByRef.get(next.ref);
  if (backendNodeId === undefined) {
    return { error: `Could not move to node ${next.ref}.` };
  }

  const { object } = await page.cdp.send<{ object: { objectId?: string } }>(
    "DOM.resolveNode",
    { backendNodeId },
    page.sessionId,
  );
  if (!object.objectId) return { error: `Could not move to node ${next.ref}.` };

  await page.cdp.send(
    "Runtime.callFunctionOn",
    {
      objectId: object.objectId,
      // Headings and landmarks are not normally focusable. A screen reader can still
      // place its cursor there, so make them focusable for the duration of the visit
      // rather than pretending the user cannot reach them.
      functionDeclaration: `function(){
        this.scrollIntoView({block:'center'});
        if (this.tabIndex < 0 && !this.hasAttribute('tabindex')) this.setAttribute('tabindex', '-1');
        this.focus();
      }`,
    },
    page.sessionId,
  );

  return { ref: next.ref };
}

async function evaluate<T>(page: PageHandle, expression: string): Promise<T | undefined> {
  const res = await page.cdp.send<{ result?: { value?: T }; exceptionDetails?: unknown }>(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    page.sessionId,
  );
  if (res.exceptionDetails) return undefined;
  return res.result?.value;
}

export async function currentUrl(page: PageHandle): Promise<string> {
  return (await evaluate<string>(page, "location.href")) ?? "";
}

export async function pageTitle(page: PageHandle): Promise<string> {
  return (await evaluate<string>(page, "document.title")) ?? "";
}

export async function pageText(page: PageHandle): Promise<string> {
  return (await evaluate<string>(page, "document.body ? document.body.innerText : ''")) ?? "";
}

/** JSON-LD blocks, which is where shopping agents look for price, availability and offers. */
export async function structuredData(page: PageHandle): Promise<unknown[]> {
  const raw = await evaluate<string[]>(
    page,
    `Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => s.textContent || '')`,
  );
  const out: unknown[] = [];
  for (const block of raw ?? []) {
    try {
      out.push(JSON.parse(block));
    } catch {
      // Malformed JSON-LD is itself a finding, but it should not crash perception.
      out.push({ parseError: true, excerpt: block.slice(0, 200) });
    }
  }
  return out;
}

/** A compact DOM view for the baseline persona: visible text plus clickable selectors. */
export async function domSummary(page: PageHandle): Promise<string> {
  const expression = `(() => {
    const sel = (el) => {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < 4) {
        let part = node.tagName.toLowerCase();
        if (node.classList.length) part += '.' + Array.from(node.classList).slice(0, 2).map(c => CSS.escape(c)).join('.');
        const parent = node.parentElement;
        if (parent) {
          const sibs = Array.from(parent.children).filter(c => c.tagName === node.tagName);
          if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
        }
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(' > ');
    };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const interactive = Array.from(document.querySelectorAll(
      'a,button,input,select,textarea,[role=button],[role=link],[onclick],[tabindex]'
    )).filter(visible).slice(0, 120).map(el => {
      const label = (el.innerText || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().slice(0, 60);
      return '  ' + el.tagName.toLowerCase() + ' "' + label + '"  selector=' + sel(el);
    });
    const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 2500);
    return 'VISIBLE TEXT:\\n' + text + '\\n\\nINTERACTIVE ELEMENTS:\\n' + interactive.join('\\n');
  })()`;
  return (await evaluate<string>(page, expression)) ?? "";
}

export async function screenshot(page: PageHandle): Promise<string | undefined> {
  try {
    const { data } = await page.cdp.send<{ data: string }>(
      "Page.captureScreenshot",
      { format: "png", quality: 70, captureBeyondViewport: false },
      page.sessionId,
    );
    return data;
  } catch {
    return undefined;
  }
}

async function pressKeyRaw(page: PageHandle, keyName: string, modifiers = 0): Promise<void> {
  const k = KEYS[keyName];
  if (!k) throw new ActionRefused(`Unsupported key: ${keyName}`);
  const base = {
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk,
    modifiers,
  };
  await page.cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base }, page.sessionId);
  if (k.text) {
    await page.cdp.send("Input.dispatchKeyEvent", { type: "char", text: k.text, ...base }, page.sessionId);
  }
  await page.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base }, page.sessionId);
}

/** Let the page react: navigations, framework re-renders, focus moves. */
async function settle(page: PageHandle, ms = 700): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * A cheap fingerprint of what the user can currently perceive.
 *
 * URL alone is not enough: a single page application changes everything on screen
 * without touching the address bar, so a URL-only check reports "nothing happened"
 * through an entire checkout. This hashes the accessibility tree instead, which is
 * both what the constrained personas actually perceive and what changes when the page
 * meaningfully changes.
 *
 * Focus is part of the fingerprint, and leaving it out was a real bug rather than an
 * oversight worth glossing. Moving focus is the *primary* navigation action for a
 * keyboard or screen reader user: tab, tab, tab is how they get anywhere. Without
 * focus in the hash, every one of those registered as "nothing changed", and four
 * consecutive tabs tripped the no-progress detector and abandoned a perfectly healthy
 * run. A loop detector that treats a screen reader user's main action as making no
 * progress is worse than no loop detector at all.
 */
export function pageFingerprint(url: string, snapshot: AxSnapshot): string {
  const shape = snapshot.nodes
    .map((n) => `${n.role}|${n.name}|${n.value ?? ""}|${n.states.join(",")}`)
    .join("\n");
  let hash = 5381;
  for (let i = 0; i < shape.length; i++) hash = ((hash << 5) + hash + shape.charCodeAt(i)) | 0;
  return `${url}#${hash}#${snapshot.nodes.length}#focus=${snapshot.focusedRef ?? "none"}`;
}

export interface ActResult {
  error?: string;
  /** What a screen reader would have said as a result of this action. */
  announcements: string[];
  navigated: boolean;
}

/**
 * Perform one action, refusing anything the persona has no capability for.
 * The refusal is returned as an error rather than thrown, so the model sees it and
 * can adapt, exactly as a real user would discover that a route is closed to them.
 */
export async function act(
  page: PageHandle,
  persona: Persona,
  snapshot: AxSnapshot,
  action: Action,
): Promise<ActResult> {
  const announcements: string[] = [];
  const urlBefore = await currentUrl(page);

  const refuse = (why: string): ActResult => ({ error: why, announcements, navigated: false });

  try {
    switch (action.action) {
      case "read":
        break;

      case "tab":
      case "shift_tab": {
        if (!persona.act.keyboard) return refuse("This persona cannot use the keyboard.");
        await pressKeyRaw(page, "Tab", action.action === "shift_tab" ? 8 : 0);
        await settle(page, 350);
        break;
      }

      case "next_heading":
      case "next_button":
      case "next_link":
      case "next_form_field":
      case "next_landmark": {
        if (!persona.act.quickNav) {
          return refuse("This persona has no screen reader quick navigation. Use tab and shift_tab.");
        }
        const moved = await quickNav(page, snapshot, action.action);
        if (moved.error) return refuse(moved.error);
        await settle(page, 250);
        break;
      }

      case "press": {
        if (!action.key) return refuse("press requires a key.");
        if (!persona.act.keyboard) return refuse("This persona cannot use the keyboard.");
        await pressKeyRaw(page, action.key);
        await settle(page);
        break;
      }

      case "type": {
        if (!persona.act.keyboard) return refuse("This persona cannot use the keyboard.");
        if (typeof action.text !== "string") return refuse("type requires text.");
        await page.cdp.send("Input.insertText", { text: action.text }, page.sessionId);
        await settle(page, 300);
        break;
      }

      case "click_selector": {
        if (!persona.act.pointer) {
          return refuse(
            "This persona has no pointer and no CSS selectors. Move focus with tab and activate with Enter or Space.",
          );
        }
        if (!action.selector) return refuse("click_selector requires a selector.");
        // Report the reason a click cannot work rather than calling click() and
        // returning true regardless. A click on a disabled or invisible element
        // silently does nothing, and silence is what let a persona click the same
        // element fourteen times in a row believing it had worked.
        const outcome = await evaluate<{ ok: boolean; reason?: string }>(
          page,
          `(() => {
            const el = document.querySelector(${JSON.stringify(action.selector)});
            if (!el) return { ok: false, reason: 'no element matched' };
            if (el.disabled) return { ok: false, reason: 'the element is disabled' };
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return { ok: false, reason: 'the element is not visible' };
            }
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
              return { ok: false, reason: 'the element has no size on screen' };
            }
            el.scrollIntoView({ block: 'center' });
            el.click();
            return { ok: true };
          })()`,
        );
        if (!outcome?.ok) {
          return refuse(`Could not click ${action.selector}: ${outcome?.reason ?? "unknown reason"}`);
        }
        await settle(page);
        break;
      }

      case "click_node": {
        if (!persona.act.accessibilityNodeRef) {
          return refuse("This persona cannot activate nodes by reference. Use tab and Enter.");
        }
        if (action.ref === undefined) return refuse("click_node requires a ref.");
        const objectId = await resolveRefToObjectId(page, snapshot, action.ref);
        if (!objectId) return refuse(`Accessibility node ${action.ref} could not be resolved to an element.`);
        await page.cdp.send(
          "Runtime.callFunctionOn",
          {
            objectId,
            functionDeclaration:
              "function(){ this.scrollIntoView({block:'center'}); this.click ? this.click() : this.dispatchEvent(new MouseEvent('click',{bubbles:true})); }",
          },
          page.sessionId,
        );
        await settle(page);
        break;
      }

      case "fill_node": {
        if (!persona.act.accessibilityNodeRef) return refuse("This persona cannot fill nodes by reference.");
        if (action.ref === undefined || typeof action.text !== "string") {
          return refuse("fill_node requires a ref and text.");
        }
        const objectId = await resolveRefToObjectId(page, snapshot, action.ref);
        if (!objectId) return refuse(`Accessibility node ${action.ref} could not be resolved to an element.`);
        await page.cdp.send(
          "Runtime.callFunctionOn",
          {
            objectId,
            functionDeclaration: `function(v){ this.focus(); this.value = v; this.dispatchEvent(new Event('input',{bubbles:true})); this.dispatchEvent(new Event('change',{bubbles:true})); }`,
            arguments: [{ value: action.text }],
          },
          page.sessionId,
        );
        await settle(page, 300);
        break;
      }

      case "navigate": {
        if (!persona.act.pointer) return refuse("This persona cannot navigate by URL.");
        if (!action.url) return refuse("navigate requires a url.");
        await page.cdp.send("Page.navigate", { url: action.url }, page.sessionId);
        await settle(page, 1500);
        break;
      }

      case "finish":
      case "blocked":
        break;

      default:
        return refuse(`Unknown action: ${String(action.action)}`);
    }
  } catch (err) {
    return refuse(err instanceof Error ? err.message : String(err));
  }

  const urlAfter = await currentUrl(page);
  const navigated = urlAfter !== urlBefore;
  if (navigated) announcements.push(`Page changed to ${urlAfter}`);

  return { announcements, navigated };
}

/** Build exactly the observation this persona is entitled to. */
export async function observe(
  page: PageHandle,
  persona: Persona,
  snapshot: AxSnapshot,
  step: number,
  extraAnnouncements: string[],
  lastActionError?: string,
): Promise<Observation> {
  const [url, title] = await Promise.all([currentUrl(page), pageTitle(page)]);

  const obs: Observation = {
    step,
    url,
    title,
    lastActionError,
    announcements: [...extraAnnouncements],
  };

  if (persona.perceive.accessibilityTree) {
    obs.axNodes = snapshot.nodes;
    obs.focusedRef = snapshot.focusedRef;
    const focused = snapshot.nodes.find((n) => n.ref === snapshot.focusedRef);
    if (focused) obs.announcements!.push(announce(focused));
  }
  if (persona.perceive.dom) obs.domSummary = await domSummary(page);
  if (persona.perceive.vision) obs.screenshotBase64 = await screenshot(page);
  if (persona.perceive.structuredData) obs.structuredData = await structuredData(page);

  return obs;
}

/** Render the observation into the text block the model reads. */
export function renderObservation(obs: Observation, snapshot: AxSnapshot, persona: Persona): string {
  const parts: string[] = [
    `STEP ${obs.step}`,
    `URL: ${obs.url}`,
    `TITLE: ${obs.title}`,
  ];

  if (obs.lastActionError) parts.push(`\nYOUR LAST ACTION FAILED: ${obs.lastActionError}`);
  if (obs.announcements?.length) parts.push(`\nSCREEN READER ANNOUNCED:\n  ${obs.announcements.join("\n  ")}`);

  if (persona.perceive.accessibilityTree) {
    parts.push(
      `\nACCESSIBILITY TREE (reading order, ${snapshot.nodes.length} nodes, ${snapshot.tabOrder.length} focusable):\n${renderReadingOrder(snapshot)}`,
    );
    parts.push(
      obs.focusedRef === undefined
        ? "\nFOCUS: nothing is focused."
        : `\nFOCUS: node [${obs.focusedRef}]`,
    );
  }
  if (obs.domSummary) parts.push(`\nDOM:\n${obs.domSummary}`);
  if (obs.structuredData?.length) {
    parts.push(`\nSTRUCTURED DATA (JSON-LD):\n${JSON.stringify(obs.structuredData).slice(0, 1800)}`);
  }
  return parts.join("\n");
}

/**
 * Did the site hand us an error page rather than a shop?
 *
 * Distinct from the preflight, which looks before a journey starts. This catches a
 * site falling over partway through, which is common under the request rate a
 * multi-persona run produces and is emphatically not an accessibility finding.
 */
export async function looksLikeErrorPage(page: PageHandle): Promise<string | undefined> {
  const [title, text] = await Promise.all([pageTitle(page), pageText(page)]);
  const haystack = `${title} ${text.slice(0, 2000)}`;

  const patterns: Array<[RegExp, string]> = [
    [/\b50[0234]\b[^.]{0,40}(error|unavailable|gateway|timeout)/i, "server error"],
    [/service unavailable|temporarily unavailable|try again later/i, "service unavailable"],
    [/\b404\b|page not found|cannot be found/i, "page not found"],
    [/too many requests|rate limit|slow down/i, "rate limited"],
    [/something went wrong|an error occurred/i, "error page"],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(haystack)) return label;
  }
  return undefined;
}

export interface AssertionResult {
  passed: boolean;
  detail: string;
}

/**
 * Decide whether the journey actually finished.
 *
 * This runs against the live page and never consults the model. A model that claims
 * success without satisfying the assertion is recorded as a false completion, which
 * is a distinct and more interesting outcome than a plain failure.
 */
export async function checkAssertion(
  page: PageHandle,
  assertion: SuccessAssertion,
): Promise<AssertionResult> {
  const [url, text] = await Promise.all([currentUrl(page), pageText(page)]);
  const haystack = text.toLowerCase();
  const reasons: string[] = [];

  if (assertion.urlMatches) {
    const re = new RegExp(assertion.urlMatches, "i");
    if (!re.test(url)) {
      return { passed: false, detail: `URL ${url} did not match /${assertion.urlMatches}/i` };
    }
    reasons.push(`URL matched /${assertion.urlMatches}/i`);
  }
  if (assertion.textPresent) {
    if (!haystack.includes(assertion.textPresent.toLowerCase())) {
      return { passed: false, detail: `Page text did not contain "${assertion.textPresent}"` };
    }
    reasons.push(`page text contained "${assertion.textPresent}"`);
  }
  if (assertion.textAbsent && haystack.includes(assertion.textAbsent.toLowerCase())) {
    return { passed: false, detail: `Page text contained the disallowed string "${assertion.textAbsent}"` };
  }

  if (reasons.length === 0) {
    return { passed: false, detail: "No assertion was configured, so completion cannot be proven." };
  }
  return { passed: true, detail: reasons.join(" and ") };
}

export { snapshotAxTree };

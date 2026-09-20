/**
 * The free tier: everything Buyable can prove without a model.
 *
 * Worth being clear about what this is. Checking a page against rules is what every
 * accessibility scanner already does, and this one is not magic. Two things make it
 * worth shipping anyway.
 *
 * It reads the accessibility tree Chrome actually computed, rather than parsing
 * static markup, so it sees the accessible name a control really ends up with after
 * ARIA, labels, alt text and content are resolved. A button whose name comes from an
 * aria-hidden icon looks fine in source and empty in the tree, and the tree is what a
 * screen reader reads.
 *
 * And it produces the announcement transcript: the page rendered as the sequence of
 * things a screen reader would actually say, in tab order. That is not a rule check.
 * It is the page as heard, and most people have never seen their own site that way.
 *
 * What this cannot do is the point of the paid tier, and `INSPECTION_LIMITS` says so
 * on every report rather than leaving the reader to assume otherwise. A rule scan
 * cannot tell you whether anyone can finish buying.
 */

import type { PageHandle } from "./browserSession.js";
import { announce, isSilentControl, snapshotAxTree, type AxSnapshot } from "./axtree.js";
import { currentUrl, pageTitle } from "./page.js";
import type { AxNode } from "./types.js";

export type FindingSeverity =
  /** A person using assistive technology cannot operate this at all. */
  | "blocks"
  /** Usable, but materially worse. */
  | "impairs"
  /** Worth knowing, not a barrier on its own. */
  | "note";

export type FindingKind =
  | "control-without-accessible-name"
  | "form-field-without-label"
  | "empty-link"
  | "unreachable-by-keyboard"
  | "non-semantic-interactive-element"
  | "image-without-alt"
  | "document-without-language"
  | "document-without-title"
  | "heading-level-skipped"
  | "focusable-without-accessible-name";

export interface InspectionFinding {
  kind: FindingKind;
  severity: FindingSeverity;
  /** One sentence a non-specialist can act on. */
  summary: string;
  role?: string;
  accessibleName?: string;
  selector?: string;
  outerHtml?: string;
  wcag: string[];
  /** What a screen reader would say on reaching this, when it is a node. */
  announcement?: string;
  /**
   * How many elements share this finding.
   *
   * A component repeated across a page produces the same defect many times, and
   * listing it once per instance buries everything else. One retail home page
   * produced the identical finding eleven times before this existed.
   */
  occurrences?: number;
}

export interface TabStop {
  position: number;
  role: string;
  name: string;
  /** Exactly what a screen reader would speak here. */
  announcement: string;
  /** True when this stop announces nothing useful. */
  silent: boolean;
}

export interface InspectionReport {
  url: string;
  finalUrl: string;
  title: string;
  language?: string;
  createdAt: string;
  durationMs: number;
  nodeCount: number;
  focusableCount: number;
  findings: InspectionFinding[];
  /** The page as a screen reader would read it, in tab order. */
  transcript: TabStop[];
  counts: Record<FindingSeverity, number>;
  /** Stated on every report. See the note at the top of this file. */
  limits: string[];
}

/**
 * What a rule scan cannot tell you.
 *
 * Printed on every report. Automated checking catches roughly a fifth to two fifths
 * of WCAG issues and only about a third of success criteria are machine testable at
 * all, so a clean scan means "no rule violations found", never "this works".
 */
export const INSPECTION_LIMITS = [
  "This checked one page against rules. It did not attempt a task, so it cannot tell you whether anyone can complete a purchase, a booking or a form.",
  "Automated checks catch a minority of accessibility problems. A page with no findings here can still be impossible to use.",
  "Judgement calls are out of scope: whether a label is meaningful, whether focus order matches the visual order, whether an error message explains what to do.",
  "Nothing here replaces testing with people who use assistive technology every day.",
];

const WCAG: Record<FindingKind, string[]> = {
  "control-without-accessible-name": ["4.1.2", "2.4.6"],
  "form-field-without-label": ["1.3.1", "3.3.2", "4.1.2"],
  "empty-link": ["2.4.4", "4.1.2"],
  "unreachable-by-keyboard": ["2.1.1"],
  "non-semantic-interactive-element": ["4.1.2", "2.1.1"],
  "image-without-alt": ["1.1.1"],
  "document-without-language": ["3.1.1"],
  "document-without-title": ["2.4.2"],
  "heading-level-skipped": ["1.3.1"],
  "focusable-without-accessible-name": ["4.1.2", "2.4.3"],
};

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "switch",
  "slider",
  "spinbutton",
  "tab",
]);

const FIELD_ROLES = new Set(["textbox", "searchbox", "combobox", "listbox", "spinbutton", "slider"]);

/** Facts only the DOM can answer. */
interface DomFacts {
  language?: string;
  /** Candidates, before their listeners have been confirmed. */
  fakeControls: Array<{ index: number; selector: string; outerHtml: string; text: string }>;
}

/**
 * A CSS selector for one node, resolved on demand.
 *
 * Deliberately lazy. Resolving every node cost two CDP round trips each, which on a
 * real retail home page meant over six hundred calls and a three minute scan. A page
 * typically produces a few dozen findings, so resolving only those is the same
 * information in a fraction of the time.
 */
async function selectorForNode(page: PageHandle, backendNodeId: number): Promise<string | undefined> {
  try {
    const { object } = await page.cdp.send<{ object: { objectId?: string } }>(
      "DOM.resolveNode",
      { backendNodeId },
      page.sessionId,
    );
    if (!object.objectId) return undefined;
    const { result } = await page.cdp.send<{ result: { value?: string } }>(
      "Runtime.callFunctionOn",
      {
        objectId: object.objectId,
        returnByValue: true,
        functionDeclaration: `function(){
          if (this.id) return '#' + CSS.escape(this.id);
          const parts = [];
          let node = this;
          while (node && node.nodeType === 1 && parts.length < 5) {
            let part = node.tagName.toLowerCase();
            if (node.classList.length) {
              part += '.' + Array.from(node.classList).slice(0, 2).map(c => CSS.escape(c)).join('.');
            }
            const parent = node.parentElement;
            if (parent) {
              const sibs = Array.from(parent.children).filter(c => c.tagName === node.tagName);
              if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
            }
            parts.unshift(part);
            node = node.parentElement;
          }
          return parts.join(' > ');
        }`,
      },
      page.sessionId,
    );
    return result.value;
  } catch {
    return undefined;
  }
}

/**
 * The real tab order, which is not the same as the set of focusable elements.
 *
 * The accessibility tree marks anything programmatically focusable as focusable,
 * including elements with tabindex="-1", which exist precisely so script can focus
 * them and which a user never reaches by pressing Tab. Treating the two as the same
 * made the announcement transcript claim stops that do not exist, on real sites.
 *
 * Computed from a single DOM.getDocument call rather than one round trip per node,
 * and then intersected with the accessibility tree so anything Chrome ignores for
 * accessibility purposes is dropped. Positive tabindex values come first in
 * ascending order, as the platform specifies, then everything else in document order.
 */
async function realTabOrder(page: PageHandle, focusableBackendIds: Set<number>): Promise<number[]> {
  interface DomNode {
    backendNodeId?: number;
    nodeName?: string;
    attributes?: string[];
    children?: DomNode[];
    contentDocument?: DomNode;
    shadowRoots?: DomNode[];
  }

  const { root } = await page.cdp.send<{ root: DomNode }>(
    "DOM.getDocument",
    { depth: -1, pierce: true },
    page.sessionId,
  );

  const NATURALLY_FOCUSABLE = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"]);
  const sequence: Array<{ backendNodeId: number; tabindex: number; order: number }> = [];
  let order = 0;

  const walk = (node: DomNode): void => {
    order++;
    const attrs = new Map<string, string>();
    for (let i = 0; i + 1 < (node.attributes?.length ?? 0); i += 2) {
      attrs.set(node.attributes![i]!, node.attributes![i + 1]!);
    }

    const name = node.nodeName ?? "";
    const rawTabindex = attrs.get("tabindex");
    const tabindex = rawTabindex === undefined ? undefined : Number(rawTabindex);
    const disabled = attrs.has("disabled");
    const href = attrs.has("href");

    const naturally = NATURALLY_FOCUSABLE.has(name) && !disabled && (name !== "A" || href);
    const viaTabindex = tabindex !== undefined && Number.isFinite(tabindex) && tabindex >= 0;
    const excluded = tabindex !== undefined && Number.isFinite(tabindex) && tabindex < 0;

    if (node.backendNodeId !== undefined && !excluded && (naturally || viaTabindex)) {
      // Only count it if the accessibility tree also considers it focusable, which
      // filters out anything hidden, detached or otherwise ignored.
      if (focusableBackendIds.has(node.backendNodeId)) {
        sequence.push({ backendNodeId: node.backendNodeId, tabindex: viaTabindex ? tabindex! : 0, order });
      }
    }

    for (const child of node.children ?? []) walk(child);
    for (const shadow of node.shadowRoots ?? []) walk(shadow);
    if (node.contentDocument) walk(node.contentDocument);
  };

  walk(root);

  sequence.sort((a, b) => {
    // A positive tabindex jumps the queue, in ascending order. Everything with
    // tabindex 0 or natural focusability follows in document order.
    if (a.tabindex > 0 && b.tabindex > 0) return a.tabindex - b.tabindex || a.order - b.order;
    if (a.tabindex > 0) return -1;
    if (b.tabindex > 0) return 1;
    return a.order - b.order;
  });

  return sequence.map((s) => s.backendNodeId);
}

/**
 * Confirm a candidate really is a control, by asking Chrome what listeners it has.
 *
 * `cursor: pointer` was never evidence. It is inherited, it is used decoratively, and
 * it produced enough noise on real commercial pages to saturate the result cap twice
 * over. `DOMDebugger.getEventListeners` is ground truth: it reports the listeners
 * actually attached to the element.
 *
 * The check that survives is a sharper claim than the one it replaces. An element
 * with a click listener and no keyboard listener, exposed as no role, is operable
 * with a mouse and by nothing else. That is a barrier, and it is verifiable rather
 * than inferred.
 */
async function confirmFakeControls(
  page: PageHandle,
  candidates: Array<{ selector: string; outerHtml: string; text: string; backendNodeId?: number }>,
): Promise<Array<{ selector: string; outerHtml: string; text: string }>> {
  const checked = await Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.backendNodeId === undefined) return undefined;
      try {
        const { object } = await page.cdp.send<{ object: { objectId?: string } }>(
          "DOM.resolveNode",
          { backendNodeId: candidate.backendNodeId },
          page.sessionId,
        );
        if (!object.objectId) return undefined;

        const { listeners } = await page.cdp.send<{ listeners: Array<{ type: string }> }>(
          "DOMDebugger.getEventListeners",
          { objectId: object.objectId, depth: 0 },
          page.sessionId,
        );

        const types = new Set(listeners.map((l) => l.type));
        const pointerOnly =
          (types.has("click") || types.has("mousedown") || types.has("mouseup")) &&
          !types.has("keydown") &&
          !types.has("keypress") &&
          !types.has("keyup");

        return pointerOnly ? candidate : undefined;
      } catch {
        // getEventListeners is unavailable on some nodes. Silence is not evidence of
        // a barrier, so a candidate we cannot confirm is dropped, not reported.
        return undefined;
      }
    }),
  );

  return checked.filter((c): c is NonNullable<typeof c> => c !== undefined);
}

async function collectDomFacts(page: PageHandle): Promise<DomFacts> {
  const { result } = await page.cdp.send<{ result: { value?: DomFacts } }>(
    "Runtime.evaluate",
    {
      returnByValue: true,
      expression: `(() => {
        const sel = (el) => {
          if (el.id) return '#' + CSS.escape(el.id);
          const parts = [];
          let node = el;
          while (node && node.nodeType === 1 && parts.length < 5) {
            let part = node.tagName.toLowerCase();
            if (node.classList.length) {
              part += '.' + Array.from(node.classList).slice(0, 2).map(c => CSS.escape(c)).join('.');
            }
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

        // label belongs here. <label><span>Adults</span><input></label> is the
        // correct, accessible pattern, and without label in this list the span was
        // reported as an unreachable control. That single omission produced
        // twenty-five false findings on one real travel booking page.
        const INTERACTIVE = 'a,button,input,select,textarea,summary,label,[role=button],[role=link],[role=menuitem],[role=tab],[role=checkbox],[role=radio],[role=option],[contenteditable],[onclick]';

        // Mark candidates so they can be resolved to nodes and their real listeners
        // inspected. Narrowing here is only to keep that second pass small.
        const fakeControls = Array.from(document.querySelectorAll('div,span'))
          .filter(el => {
            if (el.getAttribute('role')) return false;
            if (el.hasAttribute('tabindex')) return false;

            // The decisive filter, and the one that was missing.
            //
            // A div inside a link inherits cursor: pointer from it. Reporting that div
            // as an unreachable control is wrong twice over: the link is the control,
            // it is perfectly reachable, and on a real retail home page this produced
            // the same finding eleven times over.
            if (el.closest(INTERACTIVE)) return false;

            // A wrapper around a real control is also fine.
            if (el.querySelector(INTERACTIVE)) return false;

            // An onclick property is unambiguous. A pointer cursor on its own is not,
            // so it only counts alongside text worth clicking.
            // A cheap pre-filter only. Whether this is really a control is settled
            // afterwards by asking Chrome for its listeners.
            const looksClickable =
              typeof el.onclick === 'function' || getComputedStyle(el).cursor === 'pointer';
            if (!looksClickable) return false;

            const text = (el.innerText || '').trim();
            if (!text || text.length > 80) return false;

            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .slice(0, 60)
          .map((el, i) => {
            el.setAttribute('data-buyable-candidate', String(i));
            return {
              index: i,
              selector: sel(el),
              outerHtml: (el.outerHTML || '').slice(0, 300),
              text: (el.innerText || '').trim().slice(0, 60)
            };
          });

        return {
          language: document.documentElement.getAttribute('lang') || undefined,
          fakeControls
        };
      })()`,
    },
    page.sessionId,
  );
  return result.value ?? { fakeControls: [] };
}

/** Collapse findings that are the same defect on the same kind of element. */
function dedupe(findings: InspectionFinding[]): InspectionFinding[] {
  const byKey = new Map<string, InspectionFinding>();
  for (const f of findings) {
    const key = [f.kind, f.role ?? "", f.accessibleName ?? "", f.selector ?? ""].join("|");
    const existing = byKey.get(key);
    if (existing) existing.occurrences = (existing.occurrences ?? 1) + 1;
    else byKey.set(key, { ...f, occurrences: 1 });
  }
  const order: Record<FindingSeverity, number> = { blocks: 0, impairs: 1, note: 2 };
  return [...byKey.values()].sort(
    (a, b) => order[a.severity] - order[b.severity] || (b.occurrences ?? 1) - (a.occurrences ?? 1),
  );
}

/** Walks up the accessibility tree looking for a control that already has a name. */
function insideNamedControl(node: AxNode, byRef: Map<number, AxNode>): boolean {
  let current = node.parentRef !== undefined ? byRef.get(node.parentRef) : undefined;
  let hops = 0;
  while (current && hops < 4) {
    if (INTERACTIVE_ROLES.has(current.role.toLowerCase()) && current.name.trim()) return true;
    current = current.parentRef !== undefined ? byRef.get(current.parentRef) : undefined;
    hops++;
  }
  return false;
}

function describe(kind: FindingKind, node?: AxNode): string {
  switch (kind) {
    case "control-without-accessible-name":
      return `A ${node?.role ?? "control"} announces nothing, so a screen reader user cannot tell what it does.`;
    case "form-field-without-label":
      return "A form field has no label, so its purpose is never announced.";
    case "empty-link":
      return 'A link has no text, so it is announced only as "link".';
    case "unreachable-by-keyboard":
      return `A ${node?.role ?? "control"} cannot be reached by keyboard, so it works only with a pointer.`;
    case "non-semantic-interactive-element":
      return "An element responds to clicks but is not exposed as a control, so assistive technology and AI agents cannot see it is interactive.";
    case "image-without-alt":
      return "An image has no text alternative, so its content is unavailable to anyone who cannot see it.";
    case "document-without-language":
      return "The page does not declare a language, so screen readers may pronounce it with the wrong voice.";
    case "document-without-title":
      return "The page has no title, so it cannot be identified in a list of tabs or windows.";
    case "heading-level-skipped":
      return "A heading level is skipped, which breaks the outline people use to navigate by structure.";
    case "focusable-without-accessible-name":
      return `Keyboard focus lands on a ${node?.role ?? "element"} that announces nothing, so a screen reader user hears silence and cannot tell what they have reached.`;
  }
}

/**
 * Inspect one page. No model, no goal, no journey.
 *
 * Deterministic end to end, which is why it can be free and instant: the only cost is
 * a few seconds of managed browser time.
 */
export async function inspectPage(page: PageHandle, requestedUrl: string): Promise<InspectionReport> {
  const startedAt = Date.now();

  await page.cdp.send("Page.navigate", { url: requestedUrl }, page.sessionId);
  await new Promise((r) => setTimeout(r, 3000));

  const snapshot: AxSnapshot = await snapshotAxTree(page);
  const [finalUrl, title] = await Promise.all([currentUrl(page), pageTitle(page)]);
  const dom = await collectDomFacts(page);

  // Resolve the marked candidates to nodes so their listeners can be inspected.
  const { root } = await page.cdp.send<{ root: { nodeId: number } }>(
    "DOM.getDocument",
    { depth: 1 },
    page.sessionId,
  );
  // Resolved concurrently. Sequentially this was three round trips per candidate and
  // took forty-five seconds on a busy travel page, which is not "instant" by any
  // reading of the word.
  const withNodes = (
    await Promise.all(
      dom.fakeControls.map(async (candidate) => {
        try {
          const { nodeId } = await page.cdp.send<{ nodeId: number }>(
            "DOM.querySelector",
            { nodeId: root.nodeId, selector: `[data-buyable-candidate="${candidate.index}"]` },
            page.sessionId,
          );
          if (!nodeId) return undefined;
          const { node } = await page.cdp.send<{ node: { backendNodeId?: number } }>(
            "DOM.describeNode",
            { nodeId },
            page.sessionId,
          );
          return { ...candidate, backendNodeId: node.backendNodeId };
        } catch {
          // A candidate we cannot resolve is dropped rather than assumed guilty.
          return undefined;
        }
      }),
    )
  ).filter((c): c is NonNullable<typeof c> => c !== undefined);

  const confirmedFakeControls = await confirmFakeControls(page, withNodes);

  const byRef = new Map(snapshot.nodes.map((n) => [n.ref, n]));
  const findings: InspectionFinding[] = [];
  /** Nodes that produced a finding, so only these pay for selector resolution. */
  const needsSelector: Array<{ finding: InspectionFinding; node: AxNode }> = [];

  const add = (kind: FindingKind, severity: FindingSeverity, node?: AxNode, extra?: Partial<InspectionFinding>) => {
    const finding: InspectionFinding = {
      kind,
      severity,
      summary: describe(kind, node),
      role: node?.role,
      accessibleName: node?.name,
      wcag: WCAG[kind],
      announcement: node ? announce(node) : undefined,
      ...extra,
    };
    findings.push(finding);
    if (node?.backendNodeId !== undefined) needsSelector.push({ finding, node });
  };

  for (const node of snapshot.nodes) {
    const role = node.role.toLowerCase();
    const named = node.name.trim().length > 0;
    // A disabled control is not focusable, and that is correct behaviour rather than
    // a barrier. Reporting it was a false positive that fired on every carousel
    // control on a real retail home page.
    const disabled = node.states.includes("disabled");

    // Severity follows reachability. A control nobody can reach announces nothing to
    // nobody, which is worth knowing and is not the same as blocking a person who is
    // standing on it. Reporting both at the same weight overstated the case on a real
    // encyclopaedia page, where five unreachable empty anchors read as five barriers.
    const reachable = node.focusable && !disabled;
    const weight: FindingSeverity = reachable ? "blocks" : "impairs";

    if (role === "link" && !named) add("empty-link", weight, node);
    else if (FIELD_ROLES.has(role) && !named) add("form-field-without-label", weight, node);
    else if (isSilentControl(node)) add("control-without-accessible-name", weight, node);

    if (INTERACTIVE_ROLES.has(role) && !node.focusable && !disabled) {
      add("unreachable-by-keyboard", "impairs", node);
    }

    // An unlabelled image inside a control that already has a name is decorative, and
    // hiding it from assistive technology is the correct thing to have done. Flagging
    // it told people to break working code.
    if ((role === "image" || role === "img") && !named && !insideNamedControl(node, byRef)) {
      add("image-without-alt", "impairs", node);
    }
  }

  for (const fake of confirmedFakeControls) {
    findings.push({
      kind: "non-semantic-interactive-element",
      severity: "blocks",
        summary:
        "An element responds to clicks but not to the keyboard, and is not exposed as a control, so it works with a mouse and with nothing else.",
      selector: fake.selector,
      outerHtml: fake.outerHtml,
      wcag: WCAG["non-semantic-interactive-element"],
      accessibleName: fake.text || undefined,
    });
  }

  if (!dom.language) add("document-without-language", "impairs");
  if (!title.trim()) add("document-without-title", "impairs");

  // Heading outline. Only a skip downward matters: going back up a level is normal
  // when a section ends.
  let previousLevel = 0;
  for (const node of snapshot.nodes) {
    if (node.role.toLowerCase() !== "heading") continue;
    const levelState = node.states.find((s) => s.startsWith("level="));
    const level = levelState ? Number(levelState.slice(6)) : 0;
    if (!level) continue;
    if (previousLevel && level > previousLevel + 1) {
      add("heading-level-skipped", "note", node, {
        summary: `A heading jumps from level ${previousLevel} to level ${level}, which breaks the outline people use to navigate by structure.`,
      });
    }
    previousLevel = level;
  }

  const focusableBackendIds = new Set(
    snapshot.nodes
      .filter((n) => n.focusable && n.backendNodeId !== undefined)
      .map((n) => n.backendNodeId!),
  );
  const tabOrderBackendIds = await realTabOrder(page, focusableBackendIds);
  const nodeByBackendId = new Map(
    snapshot.nodes.filter((n) => n.backendNodeId !== undefined).map((n) => [n.backendNodeId!, n]),
  );

  const transcript: TabStop[] = [];
  for (const backendNodeId of tabOrderBackendIds) {
    const node = nodeByBackendId.get(backendNodeId);
    if (!node) continue;
    transcript.push({
      position: transcript.length + 1,
      role: node.role,
      name: node.name,
      announcement: announce(node),
      silent: !node.name.trim(),
    });

    // Anything a keyboard user can land on that announces nothing is a barrier,
    // whatever its role. The original rules only looked at a fixed list of
    // interactive roles, and real sites put tab stops on plain containers, which the
    // transcript made obvious and the rules missed.
    if (!node.name.trim() && !isSilentControl(node)) {
      add("focusable-without-accessible-name", "blocks", node);
    }
  }

  // Resolve selectors only for nodes that produced a finding.
  for (const { finding, node } of needsSelector) {
    finding.selector = await selectorForNode(page, node.backendNodeId!);
  }

  const deduped = dedupe(findings);

  const counts: Record<FindingSeverity, number> = { blocks: 0, impairs: 0, note: 0 };
  for (const f of deduped) counts[f.severity] += f.occurrences ?? 1;

  return {
    url: requestedUrl,
    finalUrl,
    title,
    language: dom.language,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    nodeCount: snapshot.nodes.length,
    focusableCount: snapshot.tabOrder.length,
    findings: deduped,
    transcript,
    counts,
    limits: INSPECTION_LIMITS,
  };
}

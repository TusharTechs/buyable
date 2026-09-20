/**
 * Turning "the persona stopped" into "this element, on this line, is why".
 *
 * A verdict without a located cause is just an accusation. This module resolves the
 * stuck persona back to a concrete DOM element, classifies the failure, and maps it
 * to the WCAG success criteria a remediation ticket would need to cite.
 */

import type { PageHandle } from "./browserSession.js";
import { isSilentControl, type AxSnapshot } from "./axtree.js";
import type { AxNode, Blocker, BlockerKind, PersonaId } from "./types.js";

/** Classification to the WCAG success criteria that actually apply. */
const WCAG_BY_KIND: Record<BlockerKind, string[]> = {
  "control-without-accessible-name": ["4.1.2", "2.4.6"],
  "non-semantic-interactive-element": ["4.1.2", "2.1.1"],
  "unreachable-by-keyboard": ["2.1.1"],
  "focus-trap": ["2.1.2"],
  "form-field-without-label": ["1.3.1", "3.3.2", "4.1.2"],
  "empty-link": ["2.4.4", "4.1.2"],
  "state-not-exposed": ["4.1.2"],
  unknown: [],
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

export function classifyNode(node: AxNode | undefined, tagName?: string): BlockerKind {
  if (!node) return "unknown";
  const role = node.role.toLowerCase();

  if (role === "link" && !node.name.trim()) return "empty-link";
  if ((role === "textbox" || role === "searchbox" || role === "combobox") && !node.name.trim()) {
    return "form-field-without-label";
  }
  if (isSilentControl(node)) return "control-without-accessible-name";

  // A div or span that the page treats as a control but the tree does not.
  const nonSemanticTag = tagName === "div" || tagName === "span";
  if (nonSemanticTag && (role === "generic" || role === "unknown" || role === "none")) {
    return "non-semantic-interactive-element";
  }
  if (INTERACTIVE_ROLES.has(role) && !node.focusable) return "unreachable-by-keyboard";
  return "unknown";
}

interface ElementFacts {
  selector?: string;
  outerHtml?: string;
  tagName?: string;
}

async function describeElement(page: PageHandle, backendNodeId: number): Promise<ElementFacts> {
  try {
    const { object } = await page.cdp.send<{ object: { objectId?: string } }>(
      "DOM.resolveNode",
      { backendNodeId },
      page.sessionId,
    );
    if (!object.objectId) return {};

    const { result } = await page.cdp.send<{ result: { value?: ElementFacts } }>(
      "Runtime.callFunctionOn",
      {
        objectId: object.objectId,
        returnByValue: true,
        functionDeclaration: `function(){
          const sel = (el) => {
            if (el.id) return '#' + CSS.escape(el.id);
            const parts = [];
            let node = el;
            while (node && node.nodeType === 1 && parts.length < 5) {
              let part = node.tagName.toLowerCase();
              if (node.classList.length) {
                part += '.' + Array.from(node.classList).slice(0, 3).map(c => CSS.escape(c)).join('.');
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
          return {
            selector: sel(this),
            outerHtml: (this.outerHTML || '').slice(0, 600),
            tagName: this.tagName.toLowerCase()
          };
        }`,
      },
      page.sessionId,
    );
    return result.value ?? {};
  } catch {
    return {};
  }
}

/**
 * Pick the node that blocked the persona.
 *
 * Preference order: a node reference the model named in its own explanation, then
 * the focused node, then the first silent interactive control in the tree. Falling
 * back rather than giving up matters, because a report that says "something went
 * wrong somewhere" is not actionable.
 */
export async function locateBlocker(args: {
  page: PageHandle;
  snapshot: AxSnapshot;
  persona: PersonaId;
  step: number;
  url: string;
  agentExplanation: string;
}): Promise<Blocker> {
  const { page, snapshot, persona, step, url, agentExplanation } = args;

  let node: AxNode | undefined;

  // Every bracketed number the model mentioned, in the order it mentioned them.
  //
  // The previous version required the word "node" or "ref" immediately before the
  // number, which was really a transcription of how one model happens to phrase
  // things. A different model wrote "Button [33] has no accessible name" and the
  // match failed, so a run that had correctly identified the barrier reported no
  // element at all. Model-specific phrasing has no business being load-bearing in
  // code that is meant to work with any of them.
  const mentioned = [...agentExplanation.matchAll(/\[(\d+)\]/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));

  const mentionedNodes = mentioned
    .map((ref) => snapshot.nodes.find((n) => n.ref === ref))
    .filter((n): n is AxNode => n !== undefined);

  // A control that announces nothing is what we are looking for, so prefer one of
  // those over whichever number happened to be written first.
  node = mentionedNodes.find(isSilentControl) ?? mentionedNodes[0];

  if (!node && snapshot.focusedRef !== undefined) {
    const focused = snapshot.nodes.find((n) => n.ref === snapshot.focusedRef);
    // Focus on the document root tells us nothing; keep looking.
    if (focused && focused.role !== "RootWebArea") node = focused;
  }
  if (!node) {
    node = snapshot.nodes.find(isSilentControl);
  }

  let facts: ElementFacts = {};
  if (node?.backendNodeId !== undefined) {
    facts = await describeElement(page, node.backendNodeId);
  }

  const kind = classifyNode(node, facts.tagName);

  return {
    persona,
    step,
    url,
    node,
    selector: facts.selector,
    outerHtml: facts.outerHtml,
    kind,
    wcag: WCAG_BY_KIND[kind],
    agentExplanation,
  };
}

/** One line a human can act on, used in the UI and the pull request body. */
export function describeBlocker(blocker: Blocker): string {
  const target = blocker.node
    ? `<${blocker.node.role}>${blocker.node.name ? ` "${blocker.node.name}"` : " with no accessible name"}`
    : "an unidentified element";

  switch (blocker.kind) {
    case "control-without-accessible-name":
      return `A ${blocker.node?.role ?? "control"} announces nothing, so neither a screen reader user nor an AI agent can tell what it does.`;
    case "form-field-without-label":
      return `A form field has no label, so its purpose is never announced.`;
    case "empty-link":
      return `A link has no text, so it is announced only as "link".`;
    case "non-semantic-interactive-element":
      return `An element behaves like a control but is not exposed as one, so it is invisible to assistive technology and to agents.`;
    case "unreachable-by-keyboard":
      return `A control cannot be reached by keyboard, so it can only be used with a pointer.`;
    case "focus-trap":
      return `Focus cannot escape a region once it enters, so keyboard users are stranded.`;
    case "state-not-exposed":
      return `The control changes state visually but does not expose that state programmatically.`;
    default:
      return `The journey stopped at ${target}.`;
  }
}

export { WCAG_BY_KIND };

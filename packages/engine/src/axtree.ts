/**
 * The accessibility tree, normalised.
 *
 * This is the perception layer that both a screen reader and an AI shopping agent
 * actually consume. Chrome builds it from semantic HTML and ARIA, so when it is
 * degraded, both constituencies degrade together. That shared dependency is the
 * whole premise of Buyable.
 */

import type { PageHandle } from "./browserSession.js";
import type { AxNode } from "./types.js";

/** Raw CDP shapes, narrowed to the fields we use. */
interface CdpAxValue {
  type?: string;
  value?: unknown;
}
interface CdpAxProperty {
  name: string;
  value: CdpAxValue;
}
interface CdpAxNode {
  nodeId: string;
  ignored?: boolean;
  role?: CdpAxValue;
  name?: CdpAxValue;
  value?: CdpAxValue;
  description?: CdpAxValue;
  properties?: CdpAxProperty[];
  childIds?: string[];
  backendDOMNodeId?: number;
}

/**
 * Roles that carry no information for a user navigating by structure.
 * Dropping them is what a screen reader effectively does too.
 */
const STRUCTURAL_NOISE = new Set(["InlineTextBox", "none", "presentation", "LineBreak"]);

/** States worth speaking aloud, in the order a screen reader tends to speak them. */
const SPOKEN_STATES = [
  "disabled",
  "required",
  "invalid",
  "checked",
  "selected",
  "expanded",
  "pressed",
  "readonly",
  "level",
  "hasPopup",
] as const;

function str(v: CdpAxValue | undefined): string {
  if (!v || v.value === undefined || v.value === null) return "";
  return String(v.value);
}

function prop(node: CdpAxNode, name: string): CdpAxValue | undefined {
  return node.properties?.find((p) => p.name === name)?.value;
}

function boolProp(node: CdpAxNode, name: string): boolean {
  const v = prop(node, name);
  return v?.value === true || v?.value === "true";
}

export interface AxSnapshot {
  nodes: AxNode[];
  /** ref of the focused node, if any node reports focused. */
  focusedRef?: number;
  /** ref -> backendDOMNodeId, for resolving actions and patch targets. */
  backendByRef: Map<number, number>;
  /** The tab order, as refs, in document order. */
  tabOrder: number[];
}

/**
 * Pull the full tree and flatten it into a stable reading order.
 *
 * Refs are assigned by position in the reading order, so they are stable within a
 * snapshot but deliberately not across navigations. Anything long-lived keys off
 * backendDOMNodeId instead.
 */
export async function snapshotAxTree(page: PageHandle): Promise<AxSnapshot> {
  const { nodes: raw } = await page.cdp.send<{ nodes: CdpAxNode[] }>(
    "Accessibility.getFullAXTree",
    {},
    page.sessionId,
  );

  const byId = new Map<string, CdpAxNode>();
  for (const n of raw) byId.set(n.nodeId, n);

  // Depth comes from walking childIds, since the flat array does not carry it.
  const depthById = new Map<string, number>();
  const childToParent = new Map<string, string>();
  for (const n of raw) {
    for (const c of n.childIds ?? []) childToParent.set(c, n.nodeId);
  }
  const depthOf = (id: string): number => {
    const cached = depthById.get(id);
    if (cached !== undefined) return cached;
    const parent = childToParent.get(id);
    const d = parent === undefined ? 0 : depthOf(parent) + 1;
    depthById.set(id, d);
    return d;
  };

  const nodes: AxNode[] = [];
  const backendByRef = new Map<number, number>();
  const tabOrder: number[] = [];
  let focusedRef: number | undefined;
  let ref = 0;

  for (const n of raw) {
    const role = str(n.role);
    if (n.ignored) continue;
    if (STRUCTURAL_NOISE.has(role)) continue;

    const name = str(n.name);
    const focusable = boolProp(n, "focusable");

    // A StaticText node whose text is already its parent's accessible name says the
    // same thing twice. Chrome emits a lot of these and they were roughly 40% of the
    // rendered tree, which matters because the tree is the bulk of every model turn.
    if (role === "StaticText" && name) {
      const parentId = childToParent.get(n.nodeId);
      const parentName = parentId ? str(byId.get(parentId)?.name) : "";
      if (parentName && parentName.includes(name)) continue;
    }

    // A generic container with no name and no focus is pure noise in a reading order.
    if (!name && !focusable && (role === "generic" || role === "GenericContainer")) continue;

    const states: string[] = [];
    for (const s of SPOKEN_STATES) {
      const v = prop(n, s);
      if (v === undefined || v.value === undefined || v.value === false || v.value === "false") {
        continue;
      }
      states.push(v.value === true ? s : `${s}=${String(v.value)}`);
    }

    const current = ref++;
    const node: AxNode = {
      ref: current,
      role: role || "unknown",
      name,
      value: str(n.value) || undefined,
      states,
      focusable,
      depth: depthOf(n.nodeId),
      backendNodeId: n.backendDOMNodeId,
    };
    nodes.push(node);
    if (n.backendDOMNodeId !== undefined) backendByRef.set(current, n.backendDOMNodeId);
    if (focusable) tabOrder.push(current);
    if (boolProp(n, "focused")) focusedRef = current;
  }

  return { nodes, focusedRef, backendByRef, tabOrder };
}

/**
 * What a screen reader would speak when focus lands on this node.
 *
 * An empty accessible name is the single most common reason a journey dies, so it
 * is rendered explicitly rather than silently producing a shorter string. The
 * phrasing matters: judges and buyers both read this line.
 */
export function announce(node: AxNode): string {
  const parts: string[] = [];
  if (node.name) {
    parts.push(`"${node.name}"`);
  } else {
    parts.push("(no accessible name)");
  }
  parts.push(node.role);
  if (node.value) parts.push(`value "${node.value}"`);
  for (const s of node.states) parts.push(s);
  return parts.join(", ");
}

/** True when this node is interactive but announces nothing useful. */
export function isSilentControl(node: AxNode): boolean {
  const interactive = new Set([
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "combobox",
    "listbox",
    "menuitem",
    "switch",
    "slider",
    "searchbox",
    "spinbutton",
    "tab",
  ]);
  return interactive.has(node.role.toLowerCase()) && node.name.trim() === "";
}

/**
 * Render the tree the way a screen reader user experiences it: a linear reading
 * order, with focus marked. Truncated from the middle when very long, because the
 * head and tail carry most of the navigational meaning.
 */
export function renderReadingOrder(
  snapshot: AxSnapshot,
  opts: { maxNodes?: number; markFocus?: boolean } = {},
): string {
  const max = opts.maxNodes ?? 220;
  const { nodes, focusedRef } = snapshot;

  const render = (n: AxNode): string => {
    const indent = "  ".repeat(Math.min(n.depth, 8));
    const focusMark = opts.markFocus !== false && n.ref === focusedRef ? "  <<< FOCUS" : "";
    const tabbable = n.focusable ? " [focusable]" : "";
    const name = n.name ? `"${n.name}"` : n.focusable ? "(no accessible name)" : "";
    const states = n.states.length ? ` {${n.states.join(" ")}}` : "";
    const value = n.value ? ` value="${n.value}"` : "";
    return `${indent}[${n.ref}] ${n.role} ${name}${value}${states}${tabbable}${focusMark}`.trimEnd();
  };

  if (nodes.length <= max) return nodes.map(render).join("\n");

  const head = Math.floor(max * 0.6);
  const tail = max - head;
  const omitted = nodes.length - max;
  return [
    ...nodes.slice(0, head).map(render),
    `  ... ${omitted} further nodes omitted ...`,
    ...nodes.slice(nodes.length - tail).map(render),
  ].join("\n");
}

/** Resolve an AX ref back to a DOM element so it can be clicked or inspected. */
export async function resolveRefToObjectId(
  page: PageHandle,
  snapshot: AxSnapshot,
  ref: number,
): Promise<string | undefined> {
  const backendNodeId = snapshot.backendByRef.get(ref);
  if (backendNodeId === undefined) return undefined;
  try {
    const { object } = await page.cdp.send<{ object: { objectId?: string } }>(
      "DOM.resolveNode",
      { backendNodeId },
      page.sessionId,
    );
    return object.objectId;
  } catch {
    return undefined;
  }
}

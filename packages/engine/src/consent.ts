/**
 * Consent dialogs: the thing standing in front of nearly every real site.
 *
 * Measured across the retailers this was tested on, almost every one opens with a
 * cookie or privacy dialog, and several put it in the first three tab stops. Until
 * now that cost a persona several steps, and a focus-trapping one could strand it
 * entirely in a way that looked exactly like a real barrier.
 *
 * Two decisions worth stating plainly, because both could reasonably have gone the
 * other way.
 *
 * **Buyable rejects, and never accepts by default.** An automated agent clicking
 * "Accept all" on a stranger's site manufactures a consent record for a person who
 * does not exist. Rejecting creates no false affirmative, and a tool whose whole
 * argument is about respecting how people want to use the web would look absurd doing
 * otherwise. Site owners scanning their own property can opt into acceptance
 * explicitly, because some journeys genuinely will not proceed without it, and that
 * is their consent to give.
 *
 * **The dialog is inspected before it is dismissed.** It is part of the journey: it is
 * the first thing a screen reader user meets, and it is frequently the least
 * accessible thing on the page. Dismissing it silently would hide a real barrier
 * behind a convenience.
 *
 * Everything here is deterministic. No model, one or two round trips.
 */

import type { PageHandle } from "./browserSession.js";
import { isSilentControl, snapshotAxTree, type AxSnapshot } from "./axtree.js";
import type { AxNode } from "./types.js";

export type ConsentPolicy =
  /** Choose the most privacy-preserving option available. The default. */
  | "reject"
  /** Close or dismiss without expressing a preference, when that is offered. */
  | "dismiss"
  /**
   * Accept. Only for someone scanning a site they own, where the journey will not
   * proceed otherwise. Never the default, and recorded in the report when used.
   */
  | "accept"
  /** Leave it alone and let the personas deal with it. */
  | "leave";

export type ConsentOutcome =
  | "no-dialog"
  | "rejected"
  | "dismissed"
  | "accepted"
  | "left-alone"
  | "not-actionable";

export interface ConsentFinding {
  /** Something wrong with the dialog itself, which is part of the journey. */
  kind: "unlabelled-control" | "no-reject-option" | "focus-trap-suspected";
  message: string;
  evidence: string;
  wcag: string[];
}

export interface ConsentResult {
  outcome: ConsentOutcome;
  /** Which control was activated, by its accessible name. */
  chose?: string;
  /** Vendor, when the markup identifies one. Useful for a pattern nobody expects. */
  platform?: string;
  /** How the dialog presented itself. */
  evidence?: string;
  /** Problems with the dialog, reported whether or not it was dismissed. */
  findings: ConsentFinding[];
  durationMs: number;
}

/**
 * Accessible names that decline, in order of preference.
 *
 * Ordered most to least privacy-preserving. "Reject all" is unambiguous; "necessary
 * only" is the same intent in the phrasing a lot of European sites use.
 */
const DECLINE_PATTERNS: RegExp[] = [
  // A decline verb anywhere in the label. Written loosely on purpose: the phrasing
  // varies far more than expected, and a pattern demanding "reject all" sailed
  // straight past GOV.UK's "Reject additional cookies".
  /\b(reject|decline|refuse|deny|disallow)\b/i,
  // Necessary-or-essential-only, in either word order.
  /\b(strictly\s+)?(necessary|essential)\b[^.]{0,24}\bonly\b/i,
  /\bonly\b[^.]{0,24}\b(strictly\s+)?(necessary|essential)\b/i,
  /continue without accepting|without accepting/i,
];

/** Names that close the dialog without stating a preference. */
const DISMISS_PATTERNS: RegExp[] = [
  /^(close|dismiss|no thanks|not now|maybe later)$/i,
  /close (this )?(dialog|banner|notice|popup)/i,
  /^×$|^✕$|^x$/i,
];

/** Names that accept. Only ever used when explicitly asked for. */
const ACCEPT_PATTERNS: RegExp[] = [
  /^(accept|allow|agree|ok|got it|i agree|understood)\s*(all|all cookies|cookies)?$/i,
  /accept all|allow all|agree to all|accept cookies|allow cookies/i,
];

/** Vendor fingerprints, purely so a report can name what it met. */
const PLATFORMS: Array<[RegExp, string]> = [
  [/onetrust|optanon/i, "OneTrust"],
  [/cookiebot|CybotCookiebot/i, "Cookiebot"],
  [/didomi/i, "Didomi"],
  [/usercentrics/i, "Usercentrics"],
  [/trustarc|truste/i, "TrustArc"],
  [/quantcast|qc-cmp/i, "Quantcast"],
  [/sourcepoint|sp_message/i, "Sourcepoint"],
  [/klaro|cookieconsent|cookie-consent/i, "generic cookie consent"],
];

/** Does this text suggest a consent dialog rather than any other modal? */
const CONSENT_TEXT =
  /cookie|consent|privacy|gdpr|tracking|personalise|personalize|your choices|we value your privacy|manage preferences/i;

function matchesAny(name: string, patterns: RegExp[]): boolean {
  const trimmed = name.trim();
  return patterns.some((p) => p.test(trimmed));
}

export interface DetectedConsent {
  present: boolean;
  /** The dialog node, when the page exposed one. */
  dialog?: AxNode;
  /** Controls inside the dialog, or the whole-page candidates when there is no dialog. */
  controls: AxNode[];
  platform?: string;
  evidence: string;
}

/**
 * Find a consent dialog.
 *
 * Two shapes are common and both are handled. A proper `dialog` or `alertdialog` with
 * its controls inside it, and a banner that is not a dialog at all: just a region
 * pinned to the viewport with accept and reject buttons in it. The second is more
 * common than it should be, and is also worse for screen reader users, since nothing
 * tells them it is there.
 */
export async function detectConsent(
  page: PageHandle,
  snapshot?: AxSnapshot,
): Promise<DetectedConsent> {
  const snap = snapshot ?? (await snapshotAxTree(page));

  const html = await pageHtmlHead(page);
  const platform = PLATFORMS.find(([pattern]) => pattern.test(html))?.[1];

  // Shape one: a real dialog whose name or contents mention consent.
  const dialogs = snap.nodes.filter((n) => /dialog|alertdialog/i.test(n.role));
  for (const dialog of dialogs) {
    const descendants = descendantsOf(snap, dialog);
    const text = [dialog.name, ...descendants.map((d) => d.name)].join(" ");
    if (!CONSENT_TEXT.test(text) && !platform) continue;

    return {
      present: true,
      dialog,
      controls: descendants.filter((d) => /button|link|checkbox|switch/i.test(d.role)),
      platform,
      evidence: `${dialog.role} "${dialog.name || "(unnamed)"}"`,
    };
  }

  // Shape two: no dialog role at all, just controls that give the game away. This is
  // the worse pattern, because nothing announces the banner's presence.
  const decliners = snap.nodes.filter(
    (n) => /button|link/i.test(n.role) && matchesAny(n.name, DECLINE_PATTERNS),
  );
  const accepters = snap.nodes.filter(
    (n) => /button|link/i.test(n.role) && matchesAny(n.name, ACCEPT_PATTERNS),
  );

  if (decliners.length > 0 || (accepters.length > 0 && platform)) {
    const controls = [...decliners, ...accepters];
    return {
      present: true,
      controls,
      platform,
      evidence: `consent controls with no dialog role: ${controls
        .slice(0, 3)
        .map((c) => `"${c.name}"`)
        .join(", ")}`,
    };
  }

  return { present: false, controls: [], platform, evidence: "no consent dialog found" };
}

/**
 * Wait for a consent dialog rather than racing it.
 *
 * Consent platforms load asynchronously, and a single snapshot taken a few seconds
 * after navigation loses that race often enough to matter. Marks and Spencer has
 * "Reject all cookies" and "Accept all cookies" sitting in the DOM while the
 * accessibility tree still shows nothing, because the banner had not been rendered
 * when we looked. Polling costs a couple of seconds on sites that have one and
 * nothing on sites that do not, since it returns as soon as something appears.
 */
async function waitForConsent(
  page: PageHandle,
  waitMs: number,
): Promise<{ detected: DetectedConsent; snapshot: AxSnapshot }> {
  const deadline = Date.now() + waitMs;
  let snapshot = await snapshotAxTree(page);
  let detected = await detectConsent(page, snapshot);

  while (!detected.present && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    snapshot = await snapshotAxTree(page);
    detected = await detectConsent(page, snapshot);
  }

  return { detected, snapshot };
}

/** Nodes beneath `root`, using the parent links the snapshot carries. */
function descendantsOf(snapshot: AxSnapshot, root: AxNode): AxNode[] {
  const byRef = new Map(snapshot.nodes.map((n) => [n.ref, n]));
  return snapshot.nodes.filter((n) => {
    let current: AxNode | undefined = n;
    let hops = 0;
    while (current && hops < 30) {
      if (current.parentRef === root.ref) return true;
      current = current.parentRef !== undefined ? byRef.get(current.parentRef) : undefined;
      hops++;
    }
    return false;
  });
}

/** Problems with the dialog itself, which a persona would have met first. */
function inspectDialog(detected: DetectedConsent): ConsentFinding[] {
  const findings: ConsentFinding[] = [];

  const silent = detected.controls.filter(isSilentControl);
  if (silent.length > 0) {
    findings.push({
      kind: "unlabelled-control",
      message:
        "A control inside the consent dialog announces nothing, so a screen reader user cannot tell what choice they are making before anything else on the site is reachable.",
      evidence: `${silent.length} unlabelled control${silent.length === 1 ? "" : "s"} in ${detected.evidence}`,
      wcag: ["4.1.2", "2.4.6"],
    });
  }

  const hasDecline = detected.controls.some((c) => matchesAny(c.name, DECLINE_PATTERNS));
  const hasAccept = detected.controls.some((c) => matchesAny(c.name, ACCEPT_PATTERNS));
  if (hasAccept && !hasDecline) {
    const offered = detected.controls
      .filter((c) => /button/i.test(c.role) && c.name.trim())
      .slice(0, 4)
      .map((c) => `"${c.name}"`)
      .join(", ");
    findings.push({
      kind: "no-reject-option",
      message:
        "The dialog offers a way to accept but no equally direct way to decline, so declining takes more steps than agreeing. Buyable will not consent on your behalf, so it closes the dialog or leaves it alone instead.",
      evidence: `controls offered: ${offered || "(none identifiable)"}`,
      wcag: [],
    });
  }

  if (detected.dialog && !detected.dialog.name.trim()) {
    findings.push({
      kind: "unlabelled-control",
      message:
        "The consent dialog itself has no accessible name, so a screen reader announces that a dialog opened without saying what it is about.",
      evidence: `${detected.dialog.role} with an empty accessible name`,
      wcag: ["4.1.2"],
    });
  }

  return findings;
}

/**
 * Deal with a consent dialog before the personas start.
 *
 * Done by the harness rather than by a persona, on purpose. A returning customer has
 * already made this choice and does not meet the banner on every visit, so testing
 * the checkout behind it is the realistic scenario. Making each persona spend its own
 * steps on it would measure the banner rather than the journey.
 */
export async function handleConsent(
  page: PageHandle,
  policy: ConsentPolicy = "reject",
  waitMs = 7000,
): Promise<ConsentResult> {
  const startedAt = Date.now();
  const { detected, snapshot } = await waitForConsent(page, waitMs);

  if (!detected.present) {
    return { outcome: "no-dialog", findings: [], durationMs: Date.now() - startedAt };
  }

  const findings = inspectDialog(detected);
  const base = {
    platform: detected.platform,
    evidence: detected.evidence,
    findings,
    durationMs: Date.now() - startedAt,
  };

  if (policy === "leave") {
    return { ...base, outcome: "left-alone", durationMs: Date.now() - startedAt };
  }

  // Preference order follows the policy, and reject is always tried before dismiss so
  // the most privacy-preserving option available is the one taken.
  const order: Array<[RegExp[], ConsentOutcome]> =
    policy === "accept"
      ? [
          [DECLINE_PATTERNS, "rejected"],
          [ACCEPT_PATTERNS, "accepted"],
          [DISMISS_PATTERNS, "dismissed"],
        ]
      : policy === "dismiss"
        ? [
            [DISMISS_PATTERNS, "dismissed"],
            [DECLINE_PATTERNS, "rejected"],
          ]
        : [
            [DECLINE_PATTERNS, "rejected"],
            [DISMISS_PATTERNS, "dismissed"],
          ];

  // Never consent to something because nothing better was offered.
  //
  // Currys presents "Allow all", "Allow recommended cookies only" and "Manage
  // cookies". The middle option is not a decline: it consents to recommended
  // cookies. Taking it because it is the least bad on screen would still be agreeing
  // on behalf of a person who does not exist, so when no genuine decline exists the
  // policy falls through to closing the dialog, and failing that to leaving it and
  // reporting that no direct decline was offered. That is a finding in its own right.
  const hasGenuineDecline = detected.controls.some((c) => matchesAny(c.name, DECLINE_PATTERNS));

  for (const [patterns, outcome] of order) {
    if (outcome === "accepted" && policy !== "accept") continue;
    if (outcome === "rejected" && !hasGenuineDecline) continue;

    const control = detected.controls.find((c) => matchesAny(c.name, patterns));
    if (!control) continue;

    const clicked = await clickNode(page, snapshot, control);
    if (!clicked) continue;

    await new Promise((r) => setTimeout(r, 1200));

    // Confirm it actually went, rather than assuming. A dialog that survives its own
    // dismiss button is itself worth knowing about.
    const after = await detectConsent(page);
    if (!after.present) {
      return { ...base, outcome, chose: control.name, durationMs: Date.now() - startedAt };
    }
  }

  return {
    ...base,
    outcome: "not-actionable",
    durationMs: Date.now() - startedAt,
  };
}

async function clickNode(page: PageHandle, snapshot: AxSnapshot, node: AxNode): Promise<boolean> {
  const backendNodeId = snapshot.backendByRef.get(node.ref);
  if (backendNodeId === undefined) return false;
  try {
    const { object } = await page.cdp.send<{ object: { objectId?: string } }>(
      "DOM.resolveNode",
      { backendNodeId },
      page.sessionId,
    );
    if (!object.objectId) return false;
    await page.cdp.send(
      "Runtime.callFunctionOn",
      {
        objectId: object.objectId,
        functionDeclaration:
          "function(){ this.scrollIntoView({block:'center'}); this.click ? this.click() : this.dispatchEvent(new MouseEvent('click',{bubbles:true})); }",
      },
      page.sessionId,
    );
    return true;
  } catch {
    return false;
  }
}

async function pageHtmlHead(page: PageHandle): Promise<string> {
  const res = await page.cdp.send<{ result?: { value?: string } }>(
    "Runtime.evaluate",
    {
      expression: "document.documentElement.outerHTML.slice(0, 120000)",
      returnByValue: true,
    },
    page.sessionId,
  );
  return res.result?.value ?? "";
}

/** One line for a report, so the reader knows exactly what was done on their behalf. */
export function describeConsent(result: ConsentResult): string {
  switch (result.outcome) {
    case "no-dialog":
      return "No consent dialog stood in the way.";
    case "rejected":
      return `A consent dialog${result.platform ? ` (${result.platform})` : ""} was declined by choosing "${result.chose}" before the journey began. Buyable never accepts on your behalf.`;
    case "dismissed":
      return `A consent dialog${result.platform ? ` (${result.platform})` : ""} was closed with "${result.chose}" without expressing a preference.`;
    case "accepted":
      return `A consent dialog${result.platform ? ` (${result.platform})` : ""} was accepted with "${result.chose}", because acceptance was explicitly requested for this run.`;
    case "left-alone":
      return "A consent dialog was present and was left in place, so the personas met it as a visitor would.";
    case "not-actionable":
      return `A consent dialog${result.platform ? ` (${result.platform})` : ""} was present and could not be dealt with: no control matching the policy was found, or the dialog survived being activated. The personas met it as a visitor would.`;
  }
}

/**
 * Exposed for tests only.
 *
 * The label patterns are the part of this file most likely to be wrong, because the
 * phrasing varies far more than anyone expects and every wrong guess either misses a
 * decline or, far worse, treats consent as a decline.
 */
export const __testing = {
  isDecline: (name: string) => matchesAny(name, DECLINE_PATTERNS),
  isAccept: (name: string) => matchesAny(name, ACCEPT_PATTERNS),
  isDismiss: (name: string) => matchesAny(name, DISMISS_PATTERNS),
};

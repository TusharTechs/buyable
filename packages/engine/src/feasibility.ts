/**
 * Can Buyable actually run this journey? Answered before anyone waits.
 *
 * A journey takes minutes and costs real money, and a good share of the time it was
 * never going to work: the site refuses to serve us, a sign-in wall stands in the way,
 * the page is an anti-bot interstitial rather than the shop. Discovering that after
 * four minutes, from a verdict that says nothing useful, is the worst of both.
 *
 * Everything here is deterministic. One page load, no model, a few seconds. If the
 * answer is no, it is a specific no: what was found, what it means, and what the
 * person can do about it.
 *
 * The design rule is that a refusal must never be vague. "Could not scan this site"
 * tells someone nothing and invites them to retry the same thing. "The site returned
 * a page titled Access Denied with no reachable controls, which is bot protection
 * rather than your shop" tells them exactly where they stand.
 */

import type { PageHandle } from "./browserSession.js";
import { snapshotAxTree } from "./axtree.js";
import { detectConsent } from "./consent.js";
import { currentUrl, pageText, pageTitle } from "./page.js";
import { getPersona } from "./personas.js";
import type { Journey, PersonaId, SuccessAssertion } from "./types.js";

export type FeasibilityCode =
  | "not-served"
  | "bot-protection"
  | "interstitial"
  | "sign-in-required"
  | "assertion-already-true"
  | "no-assertion"
  | "page-very-large"
  | "consent-dialog"
  | "few-controls";

export interface FeasibilityFinding {
  code: FeasibilityCode;
  /** `blocks` stops the run before it starts. `warns` lets it proceed, noisily. */
  severity: "blocks" | "warns";
  /** What a person should read. Complete sentences, no jargon, no blame. */
  message: string;
  /** What was observed, so the judgement can be checked rather than believed. */
  evidence: string;
  /** What they can do instead. Omitted when there is honestly nothing. */
  suggestion?: string;
}

export interface FeasibilityReport {
  /** True when a journey is worth starting. */
  canRun: boolean;
  url: string;
  finalUrl: string;
  title: string;
  tabStops: number;
  nodeCount: number;
  durationMs: number;
  findings: FeasibilityFinding[];
}

/** Titles a site serves when it has decided you are a robot. */
const REFUSAL_TITLES =
  /access denied|forbidden|error page|blocked|are you a robot|just a moment|attention required|captcha|security check|verify you are human|pardon our interruption|request rejected/i;

/** Text that marks a challenge page rather than a shop. */
const CHALLENGE_TEXT =
  /enable javascript and cookies|verify you are human|unusual traffic|automated queries|checking your browser|cloudflare|press and hold|complete the security check/i;

function looksLikeHostname(title: string, url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\d?\./, "");
    const cleaned = title.trim().toLowerCase();
    return cleaned === host || cleaned === `www.${host}` || cleaned === host.replace(/^www\./, "");
  } catch {
    return false;
  }
}

/** Would the success assertion already pass on the page we start from? */
function assertionHolds(assertion: SuccessAssertion, url: string, text: string): boolean {
  const haystack = text.toLowerCase();
  const checks: boolean[] = [];
  if (assertion.urlMatches) checks.push(new RegExp(assertion.urlMatches, "i").test(url));
  if (assertion.textPresent) checks.push(haystack.includes(assertion.textPresent.toLowerCase()));
  return checks.length > 0 && checks.every(Boolean);
}

/**
 * Look at the starting page and decide whether the journey is worth attempting.
 *
 * Ordered so the most conclusive reasons come first: a page that was never served
 * makes every other observation irrelevant.
 */
export async function checkFeasibility(
  page: PageHandle,
  journey: Journey,
  personas: PersonaId[] = ["baseline", "assistive"],
): Promise<FeasibilityReport> {
  const startedAt = Date.now();

  await page.cdp.send("Page.navigate", { url: journey.startUrl }, page.sessionId);
  await new Promise((r) => setTimeout(r, 3000));

  const [finalUrl, title, text] = await Promise.all([
    currentUrl(page),
    pageTitle(page),
    pageText(page),
  ]);
  const snapshot = await snapshotAxTree(page);

  const tabStops = snapshot.nodes.filter((n) => n.focusable).length;
  const findings: FeasibilityFinding[] = [];

  const add = (f: FeasibilityFinding) => findings.push(f);

  /* ------------------------------------------------------------------ *
   * Was a usable page served at all?
   * ------------------------------------------------------------------ */

  if (snapshot.nodes.length <= 3 && tabStops === 0) {
    add({
      code: "not-served",
      severity: "blocks",
      message:
        "The site did not return a usable page. There is nothing here to navigate, so no journey can be attempted.",
      evidence: `${snapshot.nodes.length} accessibility nodes and no reachable controls at ${finalUrl}`,
      suggestion:
        "Check the URL loads in an ordinary browser. If it does, the site is likely refusing automated clients.",
    });
  }

  if (REFUSAL_TITLES.test(title) || CHALLENGE_TEXT.test(text.slice(0, 3000))) {
    add({
      code: "bot-protection",
      severity: "blocks",
      message:
        "This site is serving an anti-bot page rather than the shop, so anything measured here would describe the block, not the site.",
      evidence: `page title "${title.trim() || "(none)"}"`,
      suggestion:
        "Buyable does not evade bot protection. Run it against a staging environment, or allow its requests from your side.",
    });
  }

  if (title.trim() && looksLikeHostname(title, finalUrl) && tabStops < 5) {
    add({
      code: "bot-protection",
      severity: "blocks",
      message:
        "The page title is just the domain name and almost nothing is reachable, which is what a site returns when it has decided the visitor is automated.",
      evidence: `title "${title.trim()}" with ${tabStops} reachable controls`,
      suggestion:
        "Buyable does not evade bot protection. Run it against a staging environment, or allow its requests from your side.",
    });
  }

  const alreadyBlocked = findings.some((f) => f.severity === "blocks");

  if (!alreadyBlocked && tabStops > 0 && tabStops < 5) {
    add({
      code: "interstitial",
      severity: "blocks",
      message:
        "Only a handful of controls are reachable, which usually means an interstitial rather than the real page: an age gate, a country chooser, or a challenge.",
      evidence: `${tabStops} reachable controls, ${snapshot.nodes.length} accessibility nodes`,
      suggestion: "Start the journey from the page that appears after the interstitial.",
    });
  }

  /* ------------------------------------------------------------------ *
   * Is the journey itself well formed?
   * ------------------------------------------------------------------ */

  if (!journey.assertion.textPresent && !journey.assertion.urlMatches) {
    add({
      code: "no-assertion",
      severity: "blocks",
      message:
        "There is no way to prove this journey finished, so a run could report success without anything having happened.",
      evidence: "no textPresent and no urlMatches were given",
      suggestion:
        "Give text that appears only on the final page, or a pattern the final URL matches.",
    });
  } else if (assertionHolds(journey.assertion, finalUrl, text)) {
    add({
      code: "assertion-already-true",
      severity: "blocks",
      message:
        "The success condition is already satisfied on the starting page, so every persona would finish at step one without doing anything.",
      evidence: `the assertion holds at ${finalUrl} before any action is taken`,
      suggestion:
        "Choose text or a URL pattern that only appears at the end of the journey, such as an order confirmation.",
    });
  }

  /* ------------------------------------------------------------------ *
   * Will it be harder than it should be?
   * ------------------------------------------------------------------ */

  const hasPasswordField = /type="password"/i.test(await pageHtml(page));
  if (hasPasswordField && tabStops < 25) {
    add({
      code: "sign-in-required",
      severity: "blocks",
      message:
        "This page is a sign-in form. Buyable does not hold credentials and will not create accounts, so it cannot go past it.",
      evidence: "a password field with few other controls on the page",
      suggestion:
        "Start from a page reachable without signing in, or point Buyable at an environment with a test session already established.",
    });
  }

  const consent = await detectConsent(page, snapshot);
  if (consent.present) {
    const canDecline = consent.controls.some((c) =>
      /reject|decline|refuse|necessary only|only necessary|without accepting/i.test(c.name),
    );
    add({
      code: "consent-dialog",
      severity: "warns",
      message: canDecline
        ? "A consent dialog stands in front of the page. Buyable will decline it before the journey starts, and never accepts on your behalf."
        : "A consent dialog stands in front of the page and offers no direct way to decline, so Buyable will try to close it without expressing a preference. If it cannot, the personas will meet it as a visitor would.",
      evidence: `${consent.evidence}${consent.platform ? ` (${consent.platform})` : ""}`,
    });
  }

  // Compare the page against the tightest step budget of the personas being run.
  const budget = Math.min(...personas.map((p) => getPersona(p).maxSteps));
  if (tabStops > budget * 12) {
    // Past a certain ratio this stops being a caveat and becomes a certainty. A real
    // run on a page with 460 reachable controls and a 32 step budget spent six
    // minutes and produced nothing, having been warned in advance. Warning about an
    // outcome we can already predict, and then charging for it, is not much of a
    // warning.
    add({
      code: "page-very-large",
      severity: "blocks",
      message:
        "This page has so many more reachable controls than a persona has steps that the run would almost certainly exhaust its budget while still navigating, which would tell you nothing about the site.",
      evidence: `${tabStops} reachable controls against a budget of ${budget} steps, a ratio of ${Math.round(tabStops / budget)} to 1`,
      suggestion:
        "Start closer to the goal: a product page rather than a search result, or a search result rather than a home page.",
    });
  } else if (tabStops > budget * 6) {
    add({
      code: "page-very-large",
      severity: "warns",
      message:
        "This page has far more reachable controls than a persona has steps, so a run may run out of budget while still navigating rather than because anything blocked it.",
      evidence: `${tabStops} reachable controls against a budget of ${budget} steps`,
      suggestion:
        "Start closer to the goal, for example from a category or search results page rather than the home page.",
    });
  }

  if (!alreadyBlocked && tabStops >= 5 && tabStops < 8) {
    add({
      code: "few-controls",
      severity: "warns",
      message:
        "There are unusually few reachable controls for a shop, which can mean content is still loading or is rendered in a way Buyable cannot see.",
      evidence: `${tabStops} reachable controls`,
    });
  }

  return {
    canRun: !findings.some((f) => f.severity === "blocks"),
    url: journey.startUrl,
    finalUrl,
    title,
    tabStops,
    nodeCount: snapshot.nodes.length,
    durationMs: Date.now() - startedAt,
    findings,
  };
}

async function pageHtml(page: PageHandle): Promise<string> {
  const res = await page.cdp.send<{ result?: { value?: string } }>(
    "Runtime.evaluate",
    {
      expression: "document.documentElement.outerHTML.slice(0, 200000)",
      returnByValue: true,
    },
    page.sessionId,
  );
  return res.result?.value ?? "";
}

/** One paragraph a person can read, for a refusal. */
export function explainRefusal(report: FeasibilityReport): string {
  const blocking = report.findings.filter((f) => f.severity === "blocks");
  if (blocking.length === 0) return "This journey can run.";

  const lines = [
    `Buyable will not start this journey, because it would not tell you anything true.`,
    ``,
  ];
  for (const f of blocking) {
    lines.push(`${f.message}`);
    lines.push(`  What was found: ${f.evidence}`);
    if (f.suggestion) lines.push(`  What to try: ${f.suggestion}`);
    lines.push(``);
  }
  return lines.join("\n");
}

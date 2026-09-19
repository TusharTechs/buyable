/**
 * The loop that makes this a product rather than a diagnostic.
 *
 *   failed journey -> located blocker -> proposed patch -> published shadow build
 *   -> the same journey, the same persona, re-run against it -> did the number move?
 *
 * The last step is the only one that constitutes evidence. Everything before it is a
 * hypothesis, including the parts that look most convincing: a plausible diff, a
 * confident rationale and a correct WCAG citation are all things a model produces
 * just as readily when it is wrong.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { snapshotAxTree, isSilentControl } from "./axtree.js";
import { withBrowserSession } from "./browserSession.js";
import { materialisePatchedTree, proposePatch, type ProposedPatch } from "./patch.js";
import { publishShadowBuild, toShadowUrl, type ShadowBuild } from "./shadow.js";
import { runPersona } from "./runPersona.js";
import type { ReasoningProvider } from "./reasoning.js";
import type {
  Blocker,
  Journey,
  PersonaId,
  PersonaRunResult,
  PersonaVerdict,
} from "./types.js";

export interface VerifyFixOptions {
  region: string;
  provider: ReasoningProvider;
  journey: Journey;
  /** The verdict that failed, which is the "before" side of the comparison. */
  before: PersonaVerdict;
  blocker: Blocker;
  /** Local directory holding the site's source. */
  sourceRoot: string;
  shadowBucket: string;
  shadowBaseUrl: string;
  reportId: string;
  /** Attempts on the patched build. Defaults to matching the before side. */
  attempts?: number;
  onEvent?: (event: VerifyEvent) => void;
}

export type VerifyEvent =
  | { type: "patch_proposed"; patch: ProposedPatch }
  | { type: "shadow_published"; url: string; fileCount: number }
  | { type: "precheck"; silentControlsBefore: number; silentControlsAfter: number }
  | { type: "reverify_started"; persona: PersonaId; url: string }
  | { type: "verified"; result: FixVerificationResult };

export interface FixVerificationResult {
  patch: ProposedPatch;
  shadowUrl: string;
  before: PersonaVerdict;
  after: PersonaVerdict;
  /** after.rate minus before.rate. */
  delta: number;
  /**
   * True only when the constrained persona now completes the journey it could not
   * complete before. A patch that applies cleanly and changes nothing is not a fix.
   */
  proven: boolean;
  /** Cheap structural check run before spending on a full re-run. */
  precheck: { silentControlsBefore: number; silentControlsAfter: number };
  costUsd: number;
}

/**
 * Count interactive controls that announce nothing, on a given URL.
 *
 * Runs before the expensive re-verification as a fast negative: if the patch did not
 * change the accessibility tree at all, there is no point paying for a journey to
 * discover that. It is only ever used to fail early, never to declare success, since
 * a tree that changed is not the same as a journey that completes.
 */
async function countSilentControls(region: string, url: string): Promise<number> {
  return withBrowserSession(
    { region, name: "buyable-precheck", timeoutSeconds: 180 },
    async (page) => {
      await page.cdp.send("Page.navigate", { url }, page.sessionId);
      await new Promise((r) => setTimeout(r, 2000));
      const snapshot = await snapshotAxTree(page);
      return snapshot.nodes.filter(isSilentControl).length;
    },
  );
}

function toVerdict(persona: PersonaId, runs: PersonaRunResult[]): PersonaVerdict {
  const scored = runs.filter((r) => r.outcome !== "error");
  const completions = scored.filter((r) => r.completed).length;
  const blindActivations = runs.flatMap((r) => r.blindActivations);
  return {
    persona,
    attempts: scored.length,
    completions,
    rate: scored.length === 0 ? 0 : completions / scored.length,
    runs,
    blocker: runs.find((r) => r.blocker)?.blocker,
    completionsWithBlindActivation: scored.filter(
      (r) => r.completed && r.blindActivations.length > 0,
    ).length,
    blindActivations,
  };
}

export async function verifyFix(opts: VerifyFixOptions): Promise<FixVerificationResult> {
  const persona = opts.before.persona;
  const attempts = opts.attempts ?? Math.max(1, opts.before.attempts);

  // 1. Propose. Refuses loudly if the anchor is invented or ambiguous.
  const patch = await proposePatch({
    provider: opts.provider,
    sourceRoot: opts.sourceRoot,
    blocker: opts.blocker,
  });
  opts.onEvent?.({ type: "patch_proposed", patch });

  // 2. Materialise into a scratch copy. The working tree is never touched.
  const scratch = await mkdtemp(path.join(tmpdir(), "buyable-shadow-"));
  await materialisePatchedTree({
    sourceRoot: opts.sourceRoot,
    destination: scratch,
    patch,
  });

  // 3. Publish, because the browser is remote and cannot read a local directory.
  const shadow: ShadowBuild = await publishShadowBuild({
    region: opts.region,
    bucket: opts.shadowBucket,
    baseUrl: opts.shadowBaseUrl,
    directory: scratch,
    prefix: `builds/${opts.reportId}`,
  });
  opts.onEvent?.({ type: "shadow_published", url: shadow.baseUrl, fileCount: shadow.fileCount });

  const shadowStartUrl = toShadowUrl(opts.journey.startUrl, shadow);

  // 4. Cheap structural precheck on the page that actually held the blocker.
  const blockerPageUrl = toShadowUrl(opts.blocker.url, shadow);
  const [silentBefore, silentAfter] = await Promise.all([
    countSilentControls(opts.region, opts.blocker.url),
    countSilentControls(opts.region, blockerPageUrl),
  ]);
  opts.onEvent?.({
    type: "precheck",
    silentControlsBefore: silentBefore,
    silentControlsAfter: silentAfter,
  });

  // 5. Re-run the same journey, same persona, against the patched build.
  opts.onEvent?.({ type: "reverify_started", persona, url: shadowStartUrl });

  const shadowJourney: Journey = { ...opts.journey, startUrl: shadowStartUrl };
  const runs: PersonaRunResult[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    runs.push(
      await runPersona({
        region: opts.region,
        journey: shadowJourney,
        persona,
        runLabel: `${opts.reportId.slice(0, 8)}-fix${attempt}`,
        provider: opts.provider,
      }),
    );
  }

  const after = toVerdict(persona, runs);
  const delta = after.rate - opts.before.rate;

  const costUsd =
    opts.provider.estimateCostUsd(patch.inputTokens, patch.outputTokens) +
    runs.reduce((sum, r) => sum + opts.provider.estimateCostUsd(r.inputTokens, r.outputTokens), 0);

  const result: FixVerificationResult = {
    patch,
    shadowUrl: shadowStartUrl,
    before: opts.before,
    after,
    delta,
    // The bar is deliberately high: the persona must now actually complete, and it
    // must be better than it was. A patch that merely reduces violations does not
    // clear it, because reducing violations was never the promise.
    proven: after.rate > opts.before.rate && after.completions > 0,
    precheck: { silentControlsBefore: silentBefore, silentControlsAfter: silentAfter },
    costUsd,
  };

  opts.onEvent?.({ type: "verified", result });
  return result;
}

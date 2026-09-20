/**
 * Step Functions task: propose a patch and publish a build containing it.
 *
 * Only reachable when a constrained persona actually failed with a located blocker.
 * It stops short of claiming anything: the state machine re-runs the journey against
 * the published build afterwards, and that re-run is what decides whether this was a
 * fix or just a plausible diff.
 *
 * Public scans never reach this branch, because we do not have the source of somebody
 * else's site and would be guessing at a repository we cannot see.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  materialisePatchedTree,
  proposePatch,
  publishShadowBuild,
  toShadowUrl,
  PatchRefused,
  type Journey,
  type JourneyReport,
  type PersonaId,
} from "@buyable/engine";
import { getProvider, REGION, SHADOW_BASE_URL, SHADOW_BUCKET } from "./shared.js";

export interface RemediateInput {
  runId: string;
  journey: Journey;
  report: JourneyReport;
  failingPersona: PersonaId;
  /** Local path to the site's source. Only set for journeys whose source we hold. */
  sourceRoot?: string;
}

export async function handler(input: RemediateInput) {
  const verdict = input.report.verdicts[input.failingPersona];
  if (!verdict?.blocker) {
    return { patched: false, reason: "No located blocker to work from." };
  }
  if (!input.sourceRoot) {
    return {
      patched: false,
      reason:
        "Buyable does not hold the source for this site, so it can diagnose the barrier but cannot propose a verified fix.",
    };
  }

  try {
    const provider = await getProvider();
    const patch = await proposePatch({
      provider,
      sourceRoot: input.sourceRoot,
      blocker: verdict.blocker,
    });

    const scratch = await mkdtemp(path.join(tmpdir(), "buyable-shadow-"));
    await materialisePatchedTree({ sourceRoot: input.sourceRoot, destination: scratch, patch });

    const shadow = await publishShadowBuild({
      region: REGION,
      bucket: SHADOW_BUCKET,
      baseUrl: SHADOW_BASE_URL,
      directory: scratch,
      prefix: `builds/${input.runId}`,
    });

    return {
      patched: true,
      patch,
      shadowStartUrl: toShadowUrl(input.journey.startUrl, shadow),
      fileCount: shadow.fileCount,
    };
  } catch (err) {
    // A refusal is a result, not a crash. It means the anchor was invented or
    // ambiguous, and reporting that is more useful than applying something uncertain.
    if (err instanceof PatchRefused) {
      return { patched: false, reason: err.message };
    }
    throw err;
  }
}

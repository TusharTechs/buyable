/**
 * Step Functions catch-all.
 *
 * Runs when something upstream threw. Its job is to make sure the failure is visible
 * in the same place a success would have been, rather than leaving a run stuck on
 * "running" forever with the real cause buried in an execution history nobody reads.
 */

import { putRun, getRun } from "./shared.js";

export async function handler(input: { runId: string; error?: { Error?: string; Cause?: string } }) {
  const existing = await getRun(input.runId);

  let message = input.error?.Error ?? "The run failed.";
  if (input.error?.Cause) {
    try {
      const parsed = JSON.parse(input.error.Cause) as { errorMessage?: string };
      if (parsed.errorMessage) message = parsed.errorMessage;
    } catch {
      // Cause is not always JSON. The Error field is still usable.
    }
  }

  await putRun({
    runId: input.runId,
    status: "failed",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    journey: existing?.journey,
    error: message,
  });

  return { runId: input.runId, status: "failed", error: message };
}

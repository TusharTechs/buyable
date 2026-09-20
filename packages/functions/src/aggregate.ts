/**
 * Step Functions task: turn the Map output into a verdict.
 *
 * Kept separate from the attempt task so the aggregation logic is exercised by the
 * same code path whether a run came from the CLI or the API, and so a failed
 * aggregation does not waste the browser sessions that produced the runs.
 */

import { summariseRuns, type Journey, type PersonaId, type PersonaRunResult } from "@buyable/engine";
import { putRun, getRun, putObject, EVIDENCE_BUCKET } from "./shared.js";

export interface AggregateInput {
  runId: string;
  journey: Journey;
  personas: PersonaId[];
  attempts: number;
  /** Nested Map output: one array of attempt results per persona. */
  results: PersonaRunResult[][];
}

export async function handler(input: AggregateInput) {
  const report = summariseRuns({
    journey: input.journey,
    reportId: input.runId,
    runsByPersona: Object.fromEntries(
      input.personas.map((persona, index) => [persona, input.results[index] ?? []]),
    ) as Record<PersonaId, PersonaRunResult[]>,
  });

  const existing = await getRun(input.runId);
  await putRun({
    runId: input.runId,
    status: "running",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    journey: input.journey,
    progress: Object.fromEntries(
      input.personas.map((p) => [p, report.verdicts[p] ? "done" : "unknown"]),
    ),
  });

  // The raw report is written before any fix is attempted, so the record of what was
  // found survives even if the remediation branch falls over.
  await putObject({
    bucket: EVIDENCE_BUCKET,
    key: `reports/${report.createdAt.slice(0, 10)}/${input.runId}/report.json`,
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });

  // The failing persona the fix branch will work on, if there is one.
  const failing = (Object.values(report.verdicts) as Array<(typeof report.verdicts)[PersonaId]>)
    .filter((v) => v && v.persona !== "baseline" && v.rate < 1 && v.blocker)
    .sort((a, b) => a.rate - b.rate)[0];

  return {
    runId: input.runId,
    journey: input.journey,
    attempts: input.attempts,
    report,
    hasBlocker: Boolean(failing?.blocker),
    failingPersona: failing?.persona,
  };
}

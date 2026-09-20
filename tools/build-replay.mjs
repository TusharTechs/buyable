/**
 * Turn a finished report into a replayable event stream for the landing page.
 *
 *   node tools/build-replay.mjs docs/evidence/canonical-report.json \
 *     > apps/web/public/replay.json
 *
 * Why this exists: a Buyable run is only persuasive while it happens, and it takes
 * three minutes and real money. Someone arriving at the site should be able to watch
 * the control walk through a checkout while the screen reader user stops at a button
 * that says nothing, without paying for it or waiting for it.
 *
 * Nothing here is written by hand. Every step, every announcement and every verdict
 * comes out of a report produced by a real run against a deployed site, so the replay
 * cannot drift away from what the system actually does. If the behaviour changes, the
 * replay changes the next time this is run, or it stops matching and someone notices.
 */

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: build-replay.mjs <report.json> [> replay.json]");
  process.exit(1);
}

const loaded = JSON.parse(readFileSync(file, "utf8"));
/** Bundles wrap the report; a bare report is also accepted. */
const report = loaded.report ?? loaded;

/**
 * What a screen reader announced at this step.
 *
 * Runs recorded before `announcement` existed on the step still carry it inside the
 * observation digest, which is the text the model was shown. Reading it back out is
 * preferable to leaving older evidence unusable, and it is the same string either
 * way: the digest is built from `announce()`.
 */
function announcementOf(step) {
  if (step.announcement) return step.announcement;

  // The announced block holds anything queued since the last step, so a navigation
  // reads "Page changed to ..." on one line and the newly focused node on the next.
  // What belongs on the step is the node, which is the last quoted line in the block.
  const block = /SCREEN READER ANNOUNCED:\n([\s\S]*?)\n\n/.exec(step.observationDigest ?? "");
  if (!block) return undefined;
  const lines = block[1]
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // Only a real announcement counts. The block can also hold "Page changed to ...",
  // which is a note about navigation rather than something a screen reader spoke, and
  // a live run never produces one here: `announcement` comes from announce() on the
  // focused node, so it is always a quoted name or the no-name marker.
  const quoted = lines.filter((l) => l.startsWith('"') || l.startsWith("(no accessible name)"));
  return quoted.length ? quoted[quoted.length - 1] : undefined;
}

/**
 * One run per persona, chosen to represent the verdict rather than to flatter it.
 *
 * For a persona that completed, any completed run will do. For one that was blocked,
 * the run that carries the blocker is the one worth showing. Runs excluded from the
 * verdict, a network error or an exhausted step budget, are never shown, because
 * showing a run the verdict does not count would be arguing from evidence we have
 * already said proves nothing.
 */
function representative(verdict) {
  const runs = verdict.runs ?? [];
  const completed = runs.find((r) => r.completed);
  if (completed) return completed;
  const blocked = runs.find((r) => r.outcome === "blocked" && r.blocker);
  if (blocked) return blocked;
  return runs.find((r) => r.outcome !== "error" && r.outcome !== "inconclusive");
}

const events = [];
for (const [persona, verdict] of Object.entries(report.verdicts ?? {})) {
  const run = representative(verdict);
  if (!run) continue;

  events.push({ type: "session_started", persona, browserSessionId: run.browserSessionId });
  if (run.consent) events.push({ type: "consent", persona, result: run.consent });

  for (const step of run.steps ?? []) {
    events.push({
      type: "step",
      persona,
      record: {
        step: step.step,
        action: step.action,
        url: step.url,
        error: step.error,
        at: step.at,
        announcement: announcementOf(step),
      },
      narration: "",
    });
  }

  events.push({
    type: "finished",
    persona,
    result: {
      persona,
      outcome: run.outcome,
      completed: run.completed,
      // The step array is carried for its length only, which is all the view reads.
      steps: (run.steps ?? []).map((s) => ({ step: s.step })),
      blocker: run.blocker,
      errorMessage: run.errorMessage,
      durationMs: run.durationMs,
      blindActivations: run.blindActivations ?? [],
    },
  });
}

/**
 * Interleave the personas.
 *
 * They are collected persona by persona, but they did not run that way: each one had
 * its own browser and they ran at the same time. Replaying them in collection order
 * would show the control finish its whole journey before the screen reader user took
 * a single step, which is the opposite of the thing being demonstrated.
 *
 * `at` is milliseconds since that persona's run started, and the runs start together,
 * so ordering by it reproduces what actually happened.
 */
function timeOf(event) {
  if (event.type === "session_started") return -1;
  if (event.type === "consent") return 0;
  if (event.type === "step") return event.record.at ?? 0;
  return event.result.durationMs ?? Number.MAX_SAFE_INTEGER;
}
events.sort((a, b) => timeOf(a) - timeOf(b));

process.stdout.write(
  `${JSON.stringify(
    {
      source: file,
      journey: {
        name: report.journey?.name,
        startUrl: report.journey?.startUrl,
        goal: report.journey?.goal,
      },
      createdAt: report.createdAt,
      journeyCompletionRate: report.journeyCompletionRate,
      siteIsTheVariable: report.siteIsTheVariable,
      personas: Object.keys(report.verdicts ?? {}),
      events,
    },
    null,
    2,
  )}\n`,
);

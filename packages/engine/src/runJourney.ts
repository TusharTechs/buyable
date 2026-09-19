/**
 * A full journey report: every persona, repeated, aggregated into one verdict.
 *
 * Repetition is not padding. A single model run is stochastic, and accusing a real
 * website of excluding disabled customers on the strength of one flaky attempt would
 * be indefensible. Reporting completions as a fraction of attempts is what turns an
 * anecdote into a measurement.
 */

import { randomUUID } from "node:crypto";
import { runPersona, type RunEvent } from "./runPersona.js";
import type { ReasoningProvider } from "./reasoning.js";
import { PERSONA_IDS } from "./types.js";
import type {
  Journey,
  JourneyReport,
  PersonaId,
  PersonaRunResult,
  PersonaVerdict,
} from "./types.js";

export interface RunJourneyOptions {
  region: string;
  journey: Journey;
  /** Attempts per persona. Three is the default, because one proves nothing. */
  attempts?: number;
  personas?: PersonaId[];
  /** Whatever decides the actions. The same instance is used for every persona. */
  provider: ReasoningProvider;
  onEvent?: (event: RunEvent) => void;
}

function toVerdict(persona: PersonaId, runs: PersonaRunResult[]): PersonaVerdict {
  // Infrastructure errors are excluded from the denominator. They are our fault,
  // not the site's, and folding them in would understate a site unfairly.
  const scored = runs.filter((r) => r.outcome !== "error");
  const completions = scored.filter((r) => r.completed).length;
  const attempts = scored.length;

  // Prefer the blocker from a blocked run over one inferred from an exhausted run.
  const blocker =
    runs.find((r) => r.outcome === "blocked")?.blocker ?? runs.find((r) => r.blocker)?.blocker;

  const blindActivations = runs.flatMap((r) => r.blindActivations);
  const completionsWithBlindActivation = scored.filter(
    (r) => r.completed && r.blindActivations.length > 0,
  ).length;

  return {
    persona,
    attempts,
    completions,
    rate: attempts === 0 ? 0 : completions / attempts,
    runs,
    blocker,
    completionsWithBlindActivation,
    blindActivations,
  };
}

export async function runJourney(opts: RunJourneyOptions): Promise<JourneyReport> {
  const t0 = Date.now();
  const attempts = opts.attempts ?? 3;
  const personas = opts.personas ?? PERSONA_IDS;
  const reportId = randomUUID();

  // Personas run in parallel because they are fully independent. In production this
  // same fan-out is a Step Functions Map state.
  const verdictList = await Promise.all(
    personas.map(async (persona) => {
      const runs: PersonaRunResult[] = [];
      for (let attempt = 1; attempt <= attempts; attempt++) {
        runs.push(
          await runPersona({
            region: opts.region,
            journey: opts.journey,
            persona,
            runLabel: `${reportId.slice(0, 8)}-a${attempt}`,
            provider: opts.provider,
            onEvent: opts.onEvent,
          }),
        );
      }
      return toVerdict(persona, runs);
    }),
  );

  const verdicts = Object.fromEntries(verdictList.map((v) => [v.persona, v])) as Record<
    PersonaId,
    PersonaVerdict
  >;

  const rates = verdictList.map((v) => v.rate);
  const journeyCompletionRate = rates.length
    ? rates.reduce((a, b) => a + b, 0) / rates.length
    : 0;

  const baseline = verdicts.baseline;
  const constrained = verdictList.filter((v) => v.persona !== "baseline");
  const siteIsTheVariable =
    !!baseline && baseline.rate === 1 && constrained.some((v) => v.rate < 1);

  // A persona that only got through by activating a control it could not identify
  // did not really prove the journey is usable, it proved it is survivable.
  const completedOnlyByGuessing = constrained.some(
    (v) => v.completions > 0 && v.completionsWithBlindActivation === v.completions,
  );

  const allRuns = verdictList.flatMap((v) => v.runs);
  const costUsd = allRuns.reduce(
    (sum, r) => sum + opts.provider.estimateCostUsd(r.inputTokens, r.outputTokens),
    0,
  );

  return {
    reportId,
    journeyId: opts.journey.journeyId,
    journey: opts.journey,
    createdAt: new Date().toISOString(),
    verdicts,
    journeyCompletionRate,
    siteIsTheVariable,
    completedOnlyByGuessing,
    durationMs: Date.now() - t0,
    costUsd,
  };
}

/** Helper for building a journey without hand-writing the boilerplate. */
export function defineJourney(input: Omit<Journey, "journeyId" | "createdAt"> & { journeyId?: string }): Journey {
  return {
    journeyId: input.journeyId ?? randomUUID(),
    createdAt: new Date().toISOString(),
    name: input.name,
    startUrl: input.startUrl,
    goal: input.goal,
    assertion: input.assertion,
    repo: input.repo,
  };
}

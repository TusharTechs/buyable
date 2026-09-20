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
import { NON_ATTRIBUTABLE_OUTCOMES, PERSONA_IDS } from "./types.js";
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
  /** What to do about a consent dialog. Defaults to declining, never accepting. */
  consentPolicy?: import("./consent.js").ConsentPolicy;
  /** Set false only to re-run a journey already known to be feasible. */
  preflight?: boolean;
  onPreflight?: (report: import("./feasibility.js").FeasibilityReport) => void;
  onEvent?: (event: RunEvent) => void;
}

function toVerdict(persona: PersonaId, runs: PersonaRunResult[]): PersonaVerdict {
  // Runs we cannot attribute to the site are excluded from the denominator entirely.
  // Infrastructure errors and stuck runs are our fault, not the site's, and folding
  // them in would understate a site unfairly.
  const scored = runs.filter((r) => !NON_ATTRIBUTABLE_OUTCOMES.includes(r.outcome));
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
    inconclusive: runs.filter((r) => NON_ATTRIBUTABLE_OUTCOMES.includes(r.outcome)).length,
    rate: attempts === 0 ? 0 : completions / attempts,
    runs,
    blocker,
    completionsWithBlindActivation,
    blindActivations,
  };
}

/**
 * Turn raw per-persona runs into a report.
 *
 * Extracted so the CLI and the Step Functions aggregation share one implementation.
 * Two callers computing "did this journey complete" separately is exactly how a tool
 * ends up quietly reporting different verdicts through different doors.
 */
export function summariseRuns(args: {
  journey: Journey;
  reportId: string;
  runsByPersona: Partial<Record<PersonaId, PersonaRunResult[]>>;
  /** Defaults to now. Passed in only so a caller can keep an existing timestamp. */
  createdAt?: string;
  durationMs?: number;
  costUsd?: number;
}): JourneyReport {
  const entries = Object.entries(args.runsByPersona) as Array<[PersonaId, PersonaRunResult[]]>;
  const verdictList = entries.map(([persona, runs]) => toVerdict(persona, runs ?? []));

  const verdicts = Object.fromEntries(verdictList.map((v) => [v.persona, v])) as Record<
    PersonaId,
    PersonaVerdict
  >;

  // A persona with no usable attempts has no rate, and must not be read as one.
  //
  // `rate` returns 0 when there is nothing to divide, which is arithmetically
  // reasonable and was being read as "never completed". On a real journey where every
  // assistive attempt was excluded as inconclusive, that produced a 50% completion
  // rate and an accusation that the site was the variable, from a run that had
  // learned nothing about the site at all. Silence is not a failing grade.
  const measured = verdictList.filter((v) => v.attempts > 0);

  const journeyCompletionRate = measured.length
    ? measured.reduce((sum, v) => sum + v.rate, 0) / measured.length
    : 0;

  const baseline = verdicts.baseline;
  const constrained = measured.filter((v) => v.persona !== "baseline");

  return {
    reportId: args.reportId,
    journeyId: args.journey.journeyId,
    journey: args.journey,
    createdAt: args.createdAt ?? new Date().toISOString(),
    verdicts,
    journeyCompletionRate,
    // Every clause needs real measurements behind it: a control that actually
    // completed, and a constrained persona that actually ran.
    siteIsTheVariable:
      !!baseline && baseline.attempts > 0 && baseline.rate === 1 && constrained.some((v) => v.rate < 1),
    completedOnlyByGuessing: constrained.some(
      (v) => v.completions > 0 && v.completionsWithBlindActivation === v.completions,
    ),
    durationMs: args.durationMs ?? 0,
    costUsd: args.costUsd ?? 0,
  };
}

export class JourneyNotFeasible extends Error {
  constructor(
    message: string,
    readonly report: import("./feasibility.js").FeasibilityReport,
  ) {
    super(message);
    this.name = "JourneyNotFeasible";
  }
}

export async function runJourney(opts: RunJourneyOptions): Promise<JourneyReport> {
  const t0 = Date.now();
  const attempts = opts.attempts ?? 3;
  const personas = opts.personas ?? PERSONA_IDS;
  const reportId = randomUUID();

  // Decide whether this is worth starting before anyone waits four minutes for an
  // answer that was never going to mean anything. One page load, no model.
  if (opts.preflight !== false) {
    const { checkFeasibility, explainRefusal } = await import("./feasibility.js");
    const { withBrowserSession } = await import("./browserSession.js");

    const feasibility = await withBrowserSession(
      { region: opts.region, name: `buyable-preflight-${reportId.slice(0, 8)}`, timeoutSeconds: 120 },
      (page) => checkFeasibility(page, opts.journey, personas),
    );
    opts.onPreflight?.(feasibility);

    if (!feasibility.canRun) {
      throw new JourneyNotFeasible(explainRefusal(feasibility), feasibility);
    }
  }

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
            consentPolicy: opts.consentPolicy,
            onEvent: opts.onEvent,
          }),
        );
      }
      return toVerdict(persona, runs);
    }),
  );

  const allRuns = verdictList.flatMap((v) => v.runs);
  const costUsd = allRuns.reduce(
    (sum, r) => sum + opts.provider.estimateCostUsd(r.inputTokens, r.outputTokens),
    0,
  );

  return summariseRuns({
    journey: opts.journey,
    reportId,
    runsByPersona: Object.fromEntries(verdictList.map((v) => [v.persona, v.runs])),
    durationMs: Date.now() - t0,
    costUsd,
  });
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

/**
 * Does this model still measure what we think it measures?
 *
 * Buyable's central finding is a behaviour, not a capability: the assistive persona
 * stops at a control it cannot identify rather than guessing. That behaviour belongs
 * to the model, so swapping the model can invalidate every number the system
 * produces without anything appearing to break.
 *
 * This is not hypothetical. Four models have been measured against this fixture and
 * two were rejected. One, given a checkout page whose only control was a button with
 * no accessible name, pressed it anyway and reasoned that it was "activating the
 * focused button to proceed with checkout". A run on that model would have reported
 * disabled shoppers completing purchases they cannot complete, and nothing about it
 * would have looked broken. Another looped on an already-selected radio button.
 *
 * So: any provider must pass this before its output is published.
 *
 *   node tools/validate-provider.mjs                    # whatever BUYABLE_PROVIDER names
 *   node tools/validate-provider.mjs gemini             # a specific provider
 *   node tools/validate-provider.mjs gemini <model-id>  # a specific model
 */
import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { createProvider } from "../packages/engine/dist/providers/index.js";
import { runPersona } from "../packages/engine/dist/runPersona.js";
import { defineJourney } from "../packages/engine/dist/runJourney.js";

const envFile = path.resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const REGION = process.env.AWS_REGION ?? "us-west-2";

/** Outcomes that describe our infrastructure rather than the model under test. */
const NON_ATTRIBUTABLE = new Set(["error", "inconclusive"]);
const STORE = "https://d2dvlfc6rcbvw8.cloudfront.net/index.html";

const provider = createProvider({
  region: REGION,
  provider: process.argv[2],
  modelId: process.argv[3],
});

const journey = defineJourney({
  name: "Provider validation",
  startUrl: STORE,
  goal: "Buy the Harrier Trail running shoe in UK size 9 and complete the purchase so that the order is confirmed.",
  assertion: { textPresent: "Order confirmed" },
});

console.log(`Validating ${provider.id}`);
console.log(`against the fixture, whose answer is known.\n`);

const checks = [];

// 1. The control must still be able to complete the journey. If it cannot, no verdict
//    this provider produces can distinguish a broken site from a weak model.
//
//    The attribution rule applies here too, and this script was breaking it. A run
//    that ended in `error` or `inconclusive` says nothing about the model: the first
//    time this was noticed, a browser session died with "fetch failed" and the script
//    declared a model NOT VALID on the strength of it. That is precisely the mistake
//    the rest of the system exists to avoid, made by the tool that polices it.
//
//    An unattributable run is now retried once, and if it is still unattributable the
//    check is reported as inconclusive and the verdict is withheld rather than failed.
process.stdout.write("  baseline completes the journey        ... ");
let baseline = await runPersona({ region: REGION, journey, persona: "baseline", runLabel: "validate-base", provider });
if (NON_ATTRIBUTABLE.has(baseline.outcome)) {
  process.stdout.write(`(${baseline.outcome}, retrying) `);
  baseline = await runPersona({ region: REGION, journey, persona: "baseline", runLabel: "validate-base-2", provider });
}

let baselineInconclusive = false;
let baselineOk = baseline.completed;
if (!baselineOk && NON_ATTRIBUTABLE.has(baseline.outcome)) {
  baselineInconclusive = true;
  console.log(`INCONCLUSIVE (${baseline.outcome}: ${baseline.errorMessage ?? "no usable attempt"})`);
} else {
  console.log(baselineOk ? "pass" : `FAIL (${baseline.outcome}: ${baseline.errorMessage ?? "did not complete"})`);
  checks.push(baselineOk);
}

// 2. The assistive persona must stop, and stop at the right element, for the right
//    reason. Stopping somewhere else would mean it is failing for a reason we have
//    not understood.
process.stdout.write("  assistive stops at the pay button     ... ");
const assistive = await runPersona({ region: REGION, journey, persona: "assistive", runLabel: "validate-assist", provider });
const stopped = assistive.outcome === "blocked" && !assistive.completed;
const rightPlace = assistive.blocker?.selector === "#pay";
const assistiveOk = stopped && rightPlace;
console.log(
  assistiveOk
    ? "pass"
    : `FAIL (outcome=${assistive.outcome}, blocker=${assistive.blocker?.selector ?? "none"})`,
);
checks.push(assistiveOk);

// 3. The reason has to be about the missing name, not about something else that
//    happened to stop it.
process.stdout.write("  and says why, in its own words        ... ");
const why = (assistive.blocker?.agentExplanation ?? "").toLowerCase();
const coherent = /accessible name|announces nothing|no name|cannot determine|unlabel/.test(why);
console.log(coherent ? "pass" : "FAIL (explanation does not mention the missing name)");
checks.push(coherent);

console.log();
if (assistive.blocker) {
  console.log(`  it said: ${assistive.blocker.agentExplanation.slice(0, 260)}`);
  console.log();
}

/*
 * The interesting failure is not "it could not finish". It is "it finished by pressing
 * a control it could not identify", because that produces a green report on a checkout
 * a real screen reader user cannot use. Printing the model's own words at that step is
 * the whole evidence, so it is no longer left only in the run record.
 */
if (assistive.blindActivations?.length) {
  console.log(`  it completed by activating ${assistive.blindActivations.length} control(s) it could not identify:`);
  for (const b of assistive.blindActivations) {
    console.log(`    <${b.role}> ${b.selector ?? "?"}`);
    console.log(`    guessed: "${b.inferredPurpose}"`);
  }
  console.log();
}
if (assistive.completed) {
  const last = assistive.steps[assistive.steps.length - 1];
  if (last?.action?.reason) console.log(`  final step reasoning: ${last.action.reason.slice(0, 260)}\n`);
}

const cost =
  provider.estimateCostUsd(baseline.inputTokens, baseline.outputTokens) +
  provider.estimateCostUsd(assistive.inputTokens, assistive.outputTokens);
console.log(`  cost: $${cost.toFixed(4)}   steps: baseline ${baseline.steps.length}, assistive ${assistive.steps.length}`);

const passed = checks.every(Boolean);

if (baselineInconclusive) {
  // Withheld, not failed, and not passed either. A model this script could not
  // measure must not be published on, and must not be condemned on, which are two
  // different things and both matter.
  console.log(
    `\n  UNDECIDED: ${provider.id} could not be measured. The control produced no usable attempt, ` +
      `which is our infrastructure rather than the model. Run this again before drawing a conclusion.`,
  );
  process.exit(2);
}

console.log(`\n  ${passed ? "VALID" : "NOT VALID"}: ${provider.id} ${passed ? "measures what we expect." : "must not be used to publish numbers."}`);
process.exit(passed ? 0 : 1);

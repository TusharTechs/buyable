/**
 * Does this model still measure what we think it measures?
 *
 * Buyable's central finding is a behaviour, not a capability: the assistive persona
 * stops at a control it cannot identify rather than guessing. That behaviour belongs
 * to the model, so swapping the model can invalidate every number the system
 * produces without anything appearing to break.
 *
 * This is not hypothetical. The first Groq model tried, openai/gpt-oss-120b, was
 * given a checkout page whose only control was a button with no accessible name and
 * chose to press it anyway, reasoning "activate the focused button to proceed with
 * checkout". A run on that model would have reported disabled shoppers completing
 * purchases they cannot complete. qwen/qwen3.8-27b refused and explained why.
 *
 * So: any provider must pass this before its output is published.
 *
 *   node tools/validate-provider.mjs            # whatever BUYABLE_PROVIDER names
 *   node tools/validate-provider.mjs groq       # a specific one
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
process.stdout.write("  baseline completes the journey        ... ");
const baseline = await runPersona({ region: REGION, journey, persona: "baseline", runLabel: "validate-base", provider });
const baselineOk = baseline.completed;
console.log(baselineOk ? "pass" : `FAIL (${baseline.outcome}: ${baseline.errorMessage ?? "did not complete"})`);
checks.push(baselineOk);

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
  console.log(`  it said: ${assistive.blocker.agentExplanation.slice(0, 220)}`);
  console.log();
}

const cost =
  provider.estimateCostUsd(baseline.inputTokens, baseline.outputTokens) +
  provider.estimateCostUsd(assistive.inputTokens, assistive.outputTokens);
console.log(`  cost: $${cost.toFixed(4)}   steps: baseline ${baseline.steps.length}, assistive ${assistive.steps.length}`);

const passed = checks.every(Boolean);
console.log(`\n  ${passed ? "VALID" : "NOT VALID"}: ${provider.id} ${passed ? "measures what we expect." : "must not be used to publish numbers."}`);
process.exit(passed ? 0 : 1);

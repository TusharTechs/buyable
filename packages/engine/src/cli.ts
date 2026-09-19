/**
 * Local runner. Same engine the Lambdas use, driven from a terminal so the loop can
 * be iterated on without a deploy between every change.
 *
 *   node --experimental-strip-types src/cli.ts \
 *     --url https://example.com \
 *     --goal "Buy the cheapest blue running shoe in size 9" \
 *     --text-present "order confirmed" \
 *     --personas assistive,baseline \
 *     --attempts 1
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { runJourney, defineJourney } from "./runJourney.js";
import { createProvider } from "./providers/index.js";
import { describeBlocker } from "./blocker.js";
import { PERSONA_IDS, type PersonaId } from "./types.js";

/** Load .env.local from the repo root so secrets stay out of the shell history. */
function loadEnvLocal(): void {
  const file = path.resolve(process.cwd(), "..", "..", ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) return fallback;
  return process.argv[i + 1];
}

const url = arg("url");
const goal = arg("goal");
if (!url || !goal) {
  console.error("Usage: cli.ts --url <url> --goal <goal> [--text-present <s>] [--url-matches <re>]");
  console.error("                [--personas baseline,assistive,agent] [--attempts 1] [--out report.json]");
  process.exit(1);
}

const personas = (arg("personas") ?? PERSONA_IDS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) as PersonaId[];

const journey = defineJourney({
  name: arg("name") ?? goal,
  startUrl: url,
  goal,
  assertion: {
    textPresent: arg("text-present"),
    urlMatches: arg("url-matches"),
    textAbsent: arg("text-absent"),
  },
});

const bar = "=".repeat(72);
console.log(bar);
console.log(`BUYABLE  journey: ${journey.name}`);
console.log(`         start:   ${journey.startUrl}`);
console.log(`         proof:   ${JSON.stringify(journey.assertion)}`);

const provider = createProvider({
  region: process.env.AWS_REGION ?? "us-west-2",
  provider: arg("provider"),
  modelId: arg("model"),
});
console.log(`         model:   ${provider.id}`);
console.log(bar);

const report = await runJourney({
  region: process.env.AWS_REGION ?? "us-west-2",
  journey,
  personas,
  provider,
  attempts: Number(arg("attempts", "1")),
  onEvent: (e) => {
    if (e.type === "session_started") {
      console.log(`\n[${e.persona}] browser session ${e.browserSessionId ?? "?"}`);
    }
    if (e.type === "step") {
      const a = e.record.action;
      const detail = [a.ref !== undefined ? `ref=${a.ref}` : "", a.key ?? "", a.selector ?? "", a.text ?? ""]
        .filter(Boolean)
        .join(" ");
      console.log(
        `[${e.persona}] ${String(e.record.step).padStart(2)} ${a.action.padEnd(14)} ${detail.padEnd(28)} ${a.reason}`,
      );
      if (e.record.error) console.log(`[${e.persona}]    refused: ${e.record.error}`);
    }
    if (e.type === "finished") {
      console.log(
        `[${e.persona}] DONE outcome=${e.result.outcome} completed=${e.result.completed} steps=${e.result.steps.length} ${Math.round(e.result.durationMs / 1000)}s`,
      );
    }
  },
});

console.log(`\n${bar}`);
console.log("VERDICT");
console.log(bar);
for (const persona of personas) {
  const v = report.verdicts[persona];
  if (!v) continue;
  const pct = `${Math.round(v.rate * 100)}%`.padStart(4);
  console.log(`  ${persona.padEnd(10)} ${v.completions}/${v.attempts}  ${pct}`);
  if (v.completionsWithBlindActivation > 0) {
    console.log(
      `             ${v.completionsWithBlindActivation} of those completions required activating a control it could not identify`,
    );
    for (const b of v.blindActivations) {
      console.log(`               <${b.role}> ${b.selector ?? "?"}  guessed: "${b.inferredPurpose}"`);
    }
  }
  if (v.blocker) {
    console.log(`             blocked by: ${describeBlocker(v.blocker)}`);
    if (v.blocker.node) {
      console.log(
        `             node: <${v.blocker.node.role}> "${v.blocker.node.name}" ref=${v.blocker.node.ref}`,
      );
    }
    if (v.blocker.selector) console.log(`             selector: ${v.blocker.selector}`);
    if (v.blocker.wcag.length) console.log(`             WCAG: ${v.blocker.wcag.join(", ")}`);
    console.log(`             agent said: ${v.blocker.agentExplanation.slice(0, 300)}`);
  }
}
console.log(`\n  Journey Completion Rate: ${Math.round(report.journeyCompletionRate * 100)}%`);
console.log(`  Site is the variable:    ${report.siteIsTheVariable ? "YES" : "no"}`);
console.log(`  Completed only by guess: ${report.completedOnlyByGuessing ? "YES" : "no"}`);
console.log(`  Wall clock:              ${Math.round(report.durationMs / 1000)}s`);
console.log(`  Model cost:              $${report.costUsd.toFixed(4)}`);

const out = arg("out");
if (out) {
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\n  Report written to ${out}`);
}

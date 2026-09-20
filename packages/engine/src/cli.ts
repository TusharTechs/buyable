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
import { verifyFix } from "./verifyFix.js";
import { loadInfrastructure } from "./config.js";
import { bundleFromReport, renderSummaryMarkdown } from "./evidence.js";
import { renderReportHtml } from "./renderReport.js";
import { PatchRefused } from "./patch.js";
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

/* ---------------------------------------------------------------------------
 * The fix and re-verify loop.
 *
 * Only runs when a constrained persona actually failed. There is nothing to prove
 * on a journey that already completes, and generating a patch for a site that is
 * not broken is how tools earn a reputation for noise.
 * ------------------------------------------------------------------------- */
let verification: Awaited<ReturnType<typeof verifyFix>> | undefined;

if (arg("fix") !== undefined) {
  const failing = personas
    .map((p) => report.verdicts[p])
    .find((v) => v && v.persona !== "baseline" && v.rate < 1 && v.blocker);

  if (!failing?.blocker) {
    console.log(`\n  Nothing to fix: no constrained persona failed with a located blocker.`);
  } else {
    const sourceRoot = arg("source-root");
    if (!sourceRoot) {
      console.error(`\n  --fix needs --source-root pointing at the site's source.`);
      process.exit(1);
    }

    const infra = await loadInfrastructure(process.env.AWS_REGION ?? "us-west-2");

    console.log(`\n${bar}`);
    console.log(`FIX AND RE-VERIFY  (persona: ${failing.persona})`);
    console.log(bar);

    try {
      verification = await verifyFix({
        region: process.env.AWS_REGION ?? "us-west-2",
        provider,
        journey,
        before: failing,
        blocker: failing.blocker,
        sourceRoot,
        shadowBucket: infra.shadowBucket,
        shadowBaseUrl: infra.shadowBaseUrl,
        reportId: report.reportId,
        onEvent: (e) => {
          if (e.type === "patch_proposed") {
            console.log(`\n  Patch proposed for ${e.patch.filePath}`);
            console.log(`  ${e.patch.rationale}`);
            console.log(`  WCAG: ${e.patch.wcag.join(", ")}\n`);
            console.log(
              e.patch.diff
                .split("\n")
                .map((l) => `    ${l}`)
                .join("\n"),
            );
          }
          if (e.type === "shadow_published") {
            console.log(`\n  Published ${e.fileCount} files to ${e.url}`);
          }
          if (e.type === "precheck") {
            console.log(
              `  Silent controls on the blocking page: ${e.silentControlsBefore} before, ${e.silentControlsAfter} after`,
            );
          }
          if (e.type === "reverify_started") {
            console.log(`\n  Re-running the same journey as ${e.persona} against the patched build`);
            console.log(`  ${e.url}`);
          }
        },
      });

      console.log(`\n${bar}`);
      console.log(
        `  ${failing.persona}: ${Math.round(verification.before.rate * 100)}% -> ${Math.round(verification.after.rate * 100)}%`,
      );
      console.log(`  Fix proven: ${verification.proven ? "YES" : "NO"}`);
      if (!verification.proven) {
        console.log(`  The patch applied but the journey still does not complete, so it is`);
        console.log(`  reported as unproven rather than as a fix.`);
      }
      console.log(`  Verification cost: $${verification.costUsd.toFixed(4)}`);
      console.log(bar);
    } catch (err) {
      if (err instanceof PatchRefused) {
        console.error(`\n  Patch refused: ${err.message}`);
        console.error(`  Refusing is the correct outcome here. A patch that applies at the`);
        console.error(`  wrong place would read plausibly and fix nothing.`);
      } else {
        throw err;
      }
    }
  }
}

/* ---------------------------------------------------------------------------
 * Outputs.
 *
 * The bundle is the artifact that matters. It carries method alongside result, so a
 * reader can see which provider decided the actions, how many attempts were made and
 * why the baseline persona is a control, rather than having to take the numbers on
 * trust. The HTML page is a rendering of that same bundle and never of anything else.
 * ------------------------------------------------------------------------- */
const bundle = bundleFromReport({
  report,
  providerId: provider.id,
  attemptsPerPersona: Number(arg("attempts", "1")),
  fix: verification
    ? {
        patch: verification.patch,
        before: verification.before,
        after: verification.after,
        delta: verification.delta,
        proven: verification.proven,
      }
    : undefined,
});

const out = arg("out");
if (out) {
  writeFileSync(out, JSON.stringify({ report, bundle, verification }, null, 2));
  console.log(`\n  Report written to ${out}`);
}

const html = arg("html");
if (html) {
  writeFileSync(html, renderReportHtml(bundle, { cssHref: arg("css") ?? "/report.css" }));
  console.log(`  Page written to ${html}`);
}

const markdown = arg("markdown");
if (markdown) {
  writeFileSync(markdown, renderSummaryMarkdown(bundle));
  console.log(`  Summary written to ${markdown}`);
}

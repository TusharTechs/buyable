/**
 * Render a report JSON into the static HTML page a judge or a buyer actually reads.
 *
 *   node tools/render-report.mjs docs/evidence/fix-verified-report.json out.html
 *
 * Kept separate from the run so the page can be iterated on without paying for a
 * fresh set of browser sessions every time a heading moves.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { bundleFromReport } from "../packages/engine/dist/evidence.js";
import { renderReportHtml } from "../packages/engine/dist/renderReport.js";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("usage: render-report.mjs <report.json> <out.html> [--fix <verification.json>]");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(input, "utf8"));
// Older runs wrote the report alone; newer ones wrap report, bundle and verification.
const report = raw.report ?? raw;
const embedded = raw.verification;
const fixArg = process.argv.indexOf("--fix");
const fix =
  fixArg !== -1
    ? JSON.parse(readFileSync(process.argv[fixArg + 1], "utf8"))
    : embedded
      ? {
          patch: embedded.patch,
          before: embedded.before,
          after: embedded.after,
          delta: embedded.delta,
          proven: embedded.proven,
        }
      : undefined;

const attempts = Math.max(
  1,
  ...Object.values(report.verdicts).map((v) => v.attempts ?? 1),
);

const bundle = bundleFromReport({
  report,
  providerId: process.env.BUYABLE_PROVIDER_ID ?? "gemini:gemini-3.8-flash",
  attemptsPerPersona: attempts,
  fix,
});

const cssArg = process.argv.indexOf("--css");
writeFileSync(
  output,
  renderReportHtml(bundle, cssArg !== -1 ? { cssHref: process.argv[cssArg + 1] } : {}),
);
console.log(`wrote ${output}`);
console.log(`  journey completion rate: ${Math.round(bundle.result.journeyCompletionRate * 100)}%`);
console.log(`  findings: ${bundle.findings.length}`);
console.log(`  remediation: ${bundle.remediation ? "present" : "none"}`);

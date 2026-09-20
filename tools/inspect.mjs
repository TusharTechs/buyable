/**
 * Run the free deterministic inspection from a terminal.
 *
 *   node tools/inspect.mjs https://example.com
 *
 * No model, no API key, no quota. The only cost is a few seconds of managed browser.
 */
import { withBrowserSession } from "../packages/engine/dist/browserSession.js";
import { inspectPage } from "../packages/engine/dist/inspect.js";

const url = process.argv[2];
if (!url) { console.error("usage: node tools/inspect.mjs <url>"); process.exit(1); }

const report = await withBrowserSession(
  { region: process.env.AWS_REGION ?? "us-west-2", name: "buyable-inspect", timeoutSeconds: 240 },
  (page) => inspectPage(page, url),
);

const bar = "=".repeat(72);
console.log(bar);
console.log(`${report.title || "(no title)"}`);
console.log(`${report.finalUrl}`);
console.log(`${report.nodeCount} nodes, ${report.focusableCount} focusable, ${Math.round(report.durationMs / 1000)}s`);
console.log(bar);

if (report.notTheRealPage) {
  console.log(`\nTHIS IS NOT THE PAGE YOU ASKED FOR`);
  console.log(`  ${report.notTheRealPage.reason}`);
  console.log(`  Anything below describes that page, not the site. Findings about a 404`);
  console.log(`  template or an anti-bot screen are not findings about a shop.\n`);
}

console.log(`\nFINDINGS  ${report.counts.blocks} blocking, ${report.counts.impairs} impairing, ${report.counts.note} notes\n`);
for (const f of report.findings.slice(0, 20)) {
  const times = (f.occurrences ?? 1) > 1 ? `  (${f.occurrences} elements)` : "";
  console.log(`  [${f.severity}] ${f.summary}${times}`);
  if (f.selector) console.log(`           selector: ${f.selector}`);
  if (f.announcement) console.log(`           announced as: ${f.announcement}`);
  console.log(`           WCAG ${f.wcag.join(", ")}`);
  console.log();
}
if (report.findings.length > 20) console.log(`  ... and ${report.findings.length - 20} more\n`);

console.log(`\nANNOUNCEMENT TRANSCRIPT (first 15 of ${report.transcript.length} tab stops)`);
console.log("what a screen reader would say as you tab through this page\n");
for (const stop of report.transcript.slice(0, 15)) {
  console.log(`  ${String(stop.position).padStart(3)}. ${stop.announcement}${stop.silent ? "   <<< announces nothing" : ""}`);
}

console.log(`\nWHAT THIS CANNOT TELL YOU`);
for (const limit of report.limits) console.log(`  - ${limit}`);

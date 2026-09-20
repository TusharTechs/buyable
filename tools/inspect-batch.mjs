/**
 * Run the free inspection across a list of sites and record each one.
 *
 * Deterministic, no model, no API key: the only cost is a few seconds of managed
 * browser per page. That is the whole point of the free tier, and it is why a sweep
 * like this is something anybody can reproduce rather than something we assert.
 *
 *   node tools/inspect-batch.mjs sites.txt
 *
 * Each line is "slug<TAB>url". Results land in docs/evidence/sites/<slug>.json and a
 * summary table is printed. A site that refuses to serve us is recorded as refusing,
 * not skipped: "two of the top ten will not let us in" is a finding about what this
 * tool can and cannot do, and hiding it would make every other number look better
 * than it is.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { withBrowserSession } from "../packages/engine/dist/browserSession.js";
import { inspectPage } from "../packages/engine/dist/inspect.js";

const listFile = process.argv[2];
if (!listFile) {
  console.error("usage: node tools/inspect-batch.mjs <list-file>");
  process.exit(1);
}

const targets = readFileSync(listFile, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const [slug, url] = l.split(/\s+/);
    return { slug, url };
  });

mkdirSync("docs/evidence/sites", { recursive: true });
const region = process.env.AWS_REGION ?? "us-west-2";
const rows = [];

for (const { slug, url } of targets) {
  process.stdout.write(`${slug.padEnd(14)} `);
  const startedAt = Date.now();
  try {
    const report = await withBrowserSession(
      { region, name: `buyable-inspect-${slug}`, timeoutSeconds: 240 },
      (page) => inspectPage(page, url),
    );
    writeFileSync(`docs/evidence/sites/${slug}.json`, JSON.stringify(report, null, 2));

    // A page with almost nothing reachable was not really served to us, whatever
    // status code came back. Saying "0 findings" about an anti-bot page would be the
    // most flattering possible reading of being refused entry.
    // The engine now decides this, rather than the runner guessing from a control
    // count. A 404 page can easily carry more than five tab stops.
    const served = !report.notTheRealPage;
    rows.push({
      slug,
      title: (report.title || "(none)").slice(0, 44),
      served,
      why: report.notTheRealPage?.reason,
      blocks: report.counts.blocks,
      impairs: report.counts.impairs,
      tabStops: report.focusableCount,
      seconds: Math.round(report.durationMs / 1000),
    });
    console.log(
      served
        ? `${report.counts.blocks} blocking, ${report.counts.impairs} impairing, ${report.focusableCount} tab stops, ${Math.round(report.durationMs / 1000)}s`
        : `not the real page: ${report.notTheRealPage.reason}`,
    );
  } catch (err) {
    rows.push({ slug, served: false, error: String(err?.message ?? err).slice(0, 80) });
    console.log(`failed: ${String(err?.message ?? err).slice(0, 80)}`);
  }
  console.log(`               ${Math.round((Date.now() - startedAt) / 1000)}s total`);
}

console.log(`\n| Site | Result | Blocking | Impairing | Tab stops | Time |`);
console.log(`| --- | --- | --- | --- | --- | --- |`);
for (const r of rows) {
  if (r.error) console.log(`| ${r.slug} | could not scan | | | | |`);
  else if (!r.served) console.log(`| ${r.slug} | ${r.why} | | | ${r.tabStops} | ${r.seconds}s |`);
  else console.log(`| ${r.slug} | worked | ${r.blocks} | ${r.impairs} | ${r.tabStops} | ${r.seconds}s |`);
}

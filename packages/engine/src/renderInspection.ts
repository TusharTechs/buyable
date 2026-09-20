/**
 * The free report, as static HTML.
 *
 * Same contract as the journey report: server rendered, readable without JavaScript,
 * and honest about its own limits. The transcript is the centrepiece rather than the
 * findings list, because the findings are what every scanner produces and the
 * transcript is the thing people have not seen before: their own page as a sequence
 * of things a screen reader would say.
 */

import type { InspectionReport } from "./inspect.js";

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderInspectionHtml(r: InspectionReport, opts: { siteUrl?: string } = {}): string {
  const total = r.counts.blocks + r.counts.impairs + r.counts.note;

  const findings = r.findings.length
    ? r.findings
        .map(
          (f) => `
      <article class="finding">
        <h3>
          <span class="pill ${f.severity === "blocks" ? "bad" : f.severity === "impairs" ? "mixed" : "ok"}">${
            f.severity === "blocks" ? "Blocks" : f.severity === "impairs" ? "Impairs" : "Note"
          }</span>
          ${esc(f.summary)}
        </h3>
        <dl class="facts">
          ${(f.occurrences ?? 1) > 1 ? `<dt>Elements affected</dt><dd>${f.occurrences}</dd>` : ""}
          ${f.selector ? `<dt>Selector</dt><dd><code>${esc(f.selector)}</code></dd>` : ""}
          ${f.announcement ? `<dt>Announced as</dt><dd><q>${esc(f.announcement)}</q></dd>` : ""}
          <dt>WCAG</dt><dd>${f.wcag.map(esc).join(", ")}</dd>
        </dl>
      </article>`,
        )
        .join("")
    : `<p class="proof ok">No rule violations were found on this page. That is not the same as the page working: see what this cannot tell you, below.</p>`;

  const transcript = r.transcript
    .map(
      (t) => `
      <tr${t.silent ? ' class="silent"' : ""}>
        <td class="num">${t.position}</td>
        <td>${esc(t.announcement)}${t.silent ? ' <strong class="warn">announces nothing</strong>' : ""}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How a screen reader hears ${esc(r.title || r.finalUrl)}</title>
<meta name="description" content="${r.counts.blocks} blocking and ${r.counts.impairs} impairing findings, plus the full announcement transcript, for ${esc(r.finalUrl)}.">
<link rel="stylesheet" href="/report.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>

<header class="site">
  <div class="wrap">
    <a class="brand" href="${esc(opts.siteUrl ?? "/")}">Buyable</a>
    <p class="tagline">Proof that a customer can finish</p>
  </div>
</header>

<main id="main" class="wrap">
  <p class="eyebrow">Free page inspection</p>
  <h1>${esc(r.title || "(this page has no title)")}</h1>

  <dl class="subject">
    <dt>Page</dt><dd><a href="${esc(r.finalUrl)}">${esc(r.finalUrl)}</a></dd>
    <dt>Checked</dt><dd><time datetime="${esc(r.createdAt)}">${esc(r.createdAt)}</time>, in ${Math.round(r.durationMs / 1000)} seconds</dd>
    <dt>Size</dt><dd>${r.nodeCount} accessibility nodes, ${r.transcript.length} tab stops</dd>
  </dl>

  <section aria-labelledby="findings-heading">
    <h2 id="findings-heading">Findings</h2>
    <p class="headline">
      <span class="figure">${total}</span>
      <span class="label">${r.counts.blocks} blocking, ${r.counts.impairs} impairing, ${r.counts.note} notes</span>
    </p>
    ${findings}
  </section>

  <section aria-labelledby="transcript-heading">
    <h2 id="transcript-heading">The page as it is heard</h2>
    <p>
      Every stop a keyboard user reaches, in order, with what a screen reader would
      announce at each one. This is the real tab sequence: elements that are only
      focusable by script are excluded, as they are for a person pressing Tab.
    </p>
    <table>
      <caption>Announcement transcript, ${r.transcript.length} stops</caption>
      <thead><tr><th scope="col" class="num">Stop</th><th scope="col">Announced as</th></tr></thead>
      <tbody>${transcript}</tbody>
    </table>
  </section>

  <section aria-labelledby="limits-heading">
    <h2 id="limits-heading">What this cannot tell you</h2>
    <ul>
      ${r.limits.map((l) => `<li>${esc(l)}</li>`).join("")}
    </ul>
    <p class="control-note">
      This inspection is free and unlimited because it needs no model: it reads the
      accessibility tree Chrome computed and applies rules. Proving that someone can
      actually <em>complete</em> a purchase is a different job, and that is what the
      rest of Buyable does.
    </p>
  </section>
</main>

<footer class="site">
  <div class="wrap"><p>Buyable measures whether a journey can be completed, not how many rules a page breaks.</p></div>
</footer>
</body>
</html>
`;
}

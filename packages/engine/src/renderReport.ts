/**
 * Reports as standalone, static HTML.
 *
 * Two reasons this is server-rendered rather than a client-side app fed by JSON.
 *
 * First, the hackathon ship gate requires the submission to be reachable by an
 * automated scoring system as well as by human judges, and a page that renders
 * nothing without JavaScript is a page that might be scored as empty.
 *
 * Second, and less tactically: a tool that measures whether pages are readable to
 * assistive technology has no business shipping a page that is unreadable without a
 * framework. The markup below is the product's own argument applied to itself, which
 * is why the semantics here are deliberate rather than incidental.
 */

import type { EvidenceBundle } from "./evidence.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;

/** Colour is never the only carrier of meaning here. Every state also has a word. */
function verdictWord(rate: number): string {
  if (rate === 1) return "Completed";
  if (rate === 0) return "Never completed";
  return "Sometimes completed";
}

function personaBlurb(persona: string): string {
  switch (persona) {
    case "baseline":
      return "A sighted customer using a mouse. This is the control.";
    case "assistive":
      return "A customer using a screen reader, or anyone who cannot use a mouse.";
    case "agent":
      return "An AI shopping agent, which reads the same accessibility tree a screen reader does.";
    default:
      return "";
  }
}

function renderDiff(diff: string): string {
  return diff
    .split("\n")
    .map((line) => {
      const cls = line.startsWith("+")
        ? "add"
        : line.startsWith("-")
          ? "del"
          : line.startsWith("@@")
            ? "hunk"
            : "ctx";
      // The leading marker is repeated in a visually hidden span, because a screen
      // reader user should not have to infer added or removed from a colour.
      const label =
        cls === "add" ? "added: " : cls === "del" ? "removed: " : "";
      return `<span class="line ${cls}">${label ? `<span class="sr-only">${label}</span>` : ""}${escapeHtml(line)}</span>`;
    })
    .join("\n");
}

export function renderReportHtml(
  bundle: EvidenceBundle,
  opts: { siteUrl?: string; cssHref?: string } = {},
): string {
  const b = bundle;
  const title = `Can anyone complete: ${b.subject.journeyName}`;

  const headlineRate = pct(b.result.journeyCompletionRate);

  const rows = b.result.perPersona
    .map(
      (p) => `
        <tr>
          <th scope="row">
            ${escapeHtml(p.persona)}
            <span class="blurb">${escapeHtml(personaBlurb(p.persona))}</span>
          </th>
          <td class="num">${p.completions} of ${p.attempts}</td>
          <td class="num">${pct(p.rate)}</td>
          <td><span class="pill ${p.rate === 1 ? "ok" : p.rate === 0 ? "bad" : "mixed"}">${verdictWord(p.rate)}</span></td>
        </tr>`,
    )
    .join("");

  const findings = b.findings.length
    ? b.findings
        .map(
          (f) => `
      <article class="finding" aria-labelledby="finding-${escapeHtml(f.persona)}-${f.step}">
        <h3 id="finding-${escapeHtml(f.persona)}-${f.step}">${escapeHtml(f.summary)}</h3>
        <dl class="facts">
          <dt>Stopped</dt><dd>${escapeHtml(f.persona)}, at step ${f.step}</dd>
          <dt>Page</dt><dd><a href="${escapeHtml(f.url)}">${escapeHtml(f.url)}</a></dd>
          ${
            f.element
              ? `<dt>Element</dt><dd><code>&lt;${escapeHtml(f.element.role)}&gt;</code> with ${
                  f.element.accessibleName
                    ? `accessible name <q>${escapeHtml(f.element.accessibleName)}</q>`
                    : "<strong>no accessible name</strong>"
                }</dd>`
              : ""
          }
          ${f.element?.selector ? `<dt>Selector</dt><dd><code>${escapeHtml(f.element.selector)}</code></dd>` : ""}
          ${f.wcag.length ? `<dt>WCAG</dt><dd>${f.wcag.map((w) => escapeHtml(w)).join(", ")}</dd>` : ""}
        </dl>
        <blockquote>
          <p>${escapeHtml(f.agentExplanation)}</p>
          <footer>The agent's own account of being stuck, recorded verbatim.</footer>
        </blockquote>
      </article>`,
        )
        .join("")
    : `<p class="none">No persona was blocked on this journey.</p>`;

  const remediation = b.remediation
    ? `
    <section aria-labelledby="fix-heading">
      <h2 id="fix-heading">The fix, and the proof it works</h2>
      <p>${escapeHtml(b.remediation.rationale)}</p>
      <p class="filepath"><code>${escapeHtml(b.remediation.filePath)}</code></p>
      <pre class="diff"><code>${renderDiff(b.remediation.diff)}</code></pre>
      <p class="proof ${b.remediation.verification.proven ? "ok" : "bad"}">
        ${
          b.remediation.verification.proven
            ? `Re-running the same journey with the same persona against a build containing this change moved completion from <strong>${pct(b.remediation.verification.beforeRate)}</strong> to <strong>${pct(b.remediation.verification.afterRate)}</strong>.`
            : `The patch applied cleanly but the journey still does not complete, so it is reported as <strong>unproven</strong> rather than as a fix.`
        }
      </p>
    </section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="Journey Completion Rate ${headlineRate} for ${escapeHtml(b.subject.journeyName)}, measured by attempting the journey as a screen reader user, an AI agent, and a baseline control.">
<link rel="stylesheet" href="${escapeHtml(opts.cssHref ?? "/report.css")}">
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>

<header class="site">
  <div class="wrap">
    <a class="brand" href="${escapeHtml(opts.siteUrl ?? "/")}">Buyable</a>
    <p class="tagline">Proof that a customer can finish</p>
  </div>
</header>

<main id="main" class="wrap">
  <p class="eyebrow">Report ${escapeHtml(b.reportId)}</p>
  <h1>${escapeHtml(b.subject.journeyName)}</h1>

  <dl class="subject">
    <dt>Start URL</dt>
    <dd><a href="${escapeHtml(b.subject.startUrl)}">${escapeHtml(b.subject.startUrl)}</a></dd>
    <dt>Goal given to every persona</dt>
    <dd>${escapeHtml(b.subject.goal)}</dd>
    <dt>How completion was proven</dt>
    <dd>${
      [
        b.subject.provenBy.urlMatches ? `the final URL matched <code>${escapeHtml(b.subject.provenBy.urlMatches)}</code>` : "",
        b.subject.provenBy.textPresent ? `the page contained <q>${escapeHtml(b.subject.provenBy.textPresent)}</q>` : "",
      ]
        .filter(Boolean)
        .join(", and ") || "no assertion was configured"
    }. This is checked against the live page and never taken from the model's own claim.</dd>
    <dt>Run at</dt>
    <dd><time datetime="${escapeHtml(b.createdAt)}">${escapeHtml(b.createdAt)}</time></dd>
  </dl>

  <section aria-labelledby="verdict-heading">
    <h2 id="verdict-heading">Verdict</h2>

    <p class="headline">
      <span class="figure">${headlineRate}</span>
      <span class="label">Journey Completion Rate</span>
    </p>

    <table>
      <caption>Completions per persona, as a fraction of attempts</caption>
      <thead>
        <tr>
          <th scope="col">Persona</th>
          <th scope="col" class="num">Completed</th>
          <th scope="col" class="num">Rate</th>
          <th scope="col">Verdict</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p class="control-note">
      ${
        b.result.siteIsTheVariable
          ? `The baseline control completed this journey every time, and at least one constrained persona never did. <strong>The site is the variable, not the model.</strong>`
          : `The baseline control did not complete this journey cleanly, so no claim is made about the constrained personas.`
      }
    </p>
  </section>

  <section aria-labelledby="findings-heading">
    <h2 id="findings-heading">What stopped them</h2>
    ${findings}
  </section>

  ${remediation}

  <section aria-labelledby="method-heading">
    <h2 id="method-heading">Method</h2>
    <dl class="facts">
      <dt>Reasoning</dt><dd><code>${escapeHtml(b.method.reasoningProvider)}</code></dd>
      <dt>Browser</dt><dd>${escapeHtml(b.method.browser)}</dd>
      <dt>Attempts per persona</dt><dd>${b.method.attemptsPerPersona}</dd>
      <dt>Duration</dt><dd>${Math.round(b.accounting.durationMs / 1000)} seconds</dd>
      <dt>Model cost</dt><dd>$${b.accounting.estimatedModelCostUsd.toFixed(4)}</dd>
    </dl>
    <p>${escapeHtml(b.method.control)}</p>
    <p class="fineprint">${escapeHtml(b.accounting.costBasis)}</p>
  </section>
</main>

<footer class="site">
  <div class="wrap">
    <p>Buyable measures whether a journey can be completed, not how many rules a page breaks. Completion is judged against the live page, independently of the model.</p>
  </div>
</footer>
</body>
</html>
`;
}

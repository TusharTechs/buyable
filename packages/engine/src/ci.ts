/**
 * Buyable as a check on a pull request.
 *
 * This is the entry point for the GitHub Action, and it is the piece that makes the
 * product true for somebody other than us.
 *
 * Until now the honest limitation was this: Buyable can diagnose any site, but it can
 * only fix its own, because fixing needs the source and we do not have anybody else's.
 * The usual answer is a GitHub App with repository permissions and some way to map a
 * live URL back to the code that rendered it, which is a lot of machinery and a lot of
 * trust to ask for.
 *
 * Running inside the customer's own CI dissolves the problem instead of solving it.
 * Their source is already checked out. Their preview deployment already exists and
 * already has a URL. Buyable drives that URL, finds the element responsible, locates
 * it in the checkout sitting on the same runner, and writes the change into the
 * working tree. The workflow opens the pull request, from their repository, with their
 * token. We never hold their code and never need access to it.
 *
 * Two rules govern the exit code, and both come from the same principle the rest of
 * the system runs on: a result that cannot be attributed to the site is not counted
 * against it.
 *
 *  - A build fails only for a barrier that a constrained persona actually hit while
 *    the control got through. That is the one case where the site is demonstrably the
 *    variable.
 *  - Everything else, a refused preflight, a flaky run, a browser that fell over, a
 *    control that could not finish either, reports and exits zero. A check that cries
 *    wolf on infrastructure noise gets switched off within a week, and then it is
 *    protecting nobody.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describeBlocker } from "./blocker.js";
import { announcementOfStep } from "./page.js";
import { proposePatch, PatchRefused, type ProposedPatch } from "./patch.js";
import { createProvider } from "./providers/index.js";
import { defineJourney, runJourney, JourneyNotFeasible } from "./runJourney.js";
import type { FeasibilityReport } from "./feasibility.js";
import type { JourneyReport, PersonaId, PersonaVerdict } from "./types.js";

/** GitHub puts action inputs in the environment, upper cased with dashes as underscores. */
function input(name: string, fallback = ""): string {
  return (process.env[`INPUT_${name.toUpperCase().replace(/-/g, "_")}`] ?? fallback).trim();
}

function flag(name: string): boolean {
  const v = input(name).toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Append to one of the runner's collector files, when running outside CI do nothing. */
function emit(envVar: string, text: string): void {
  const file = process.env[envVar];
  if (!file) return;
  appendFileSync(file, `${text}\n`, "utf8");
}

function setOutput(name: string, value: string | number | boolean): void {
  // The heredoc form, because a diff or an explanation contains newlines and the
  // single line form silently truncates at the first one.
  const marker = `buyable_${Math.random().toString(36).slice(2)}`;
  emit("GITHUB_OUTPUT", `${name}<<${marker}\n${String(value)}\n${marker}`);
}

function summary(markdown: string): void {
  emit("GITHUB_STEP_SUMMARY", markdown);
}

/** An annotation GitHub renders against the line in the diff, when the line is known. */
function annotate(
  level: "error" | "warning" | "notice",
  message: string,
  where?: { file: string; line: number },
): void {
  const location = where ? ` file=${where.file},line=${where.line}` : "";
  // Annotations are single line, so newlines are escaped the way the runner expects.
  process.stdout.write(`::${level}${location}::${message.replace(/\n/g, "%0A")}\n`);
}

/** The first line that differs, so the annotation lands on the element, not the file. */
function firstChangedLine(before: string, after: string): number {
  const a = before.split("\n");
  const b = after.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return i + 1;
  }
  return 1;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

const PERSONA_LABEL: Record<string, string> = {
  baseline: "Baseline control",
  assistive: "Screen reader user",
  agent: "AI shopping agent",
};

/** The same names mid-sentence, where a title-cased label reads as a proper noun. */
const PERSONA_SHORT: Record<string, string> = {
  baseline: "the control",
  assistive: "the screen reader user",
  agent: "the AI shopping agent",
};

/* ------------------------------------------------------------------------- *
 * The written report, which is what a reviewer actually reads.
 * ------------------------------------------------------------------------- */

function renderRefusalSummary(report: FeasibilityReport, url: string): string {
  const lines = [
    `## Buyable did not run this journey`,
    ``,
    `Checked \`${url}\` in ${Math.round(report.durationMs / 1000)} seconds and stopped before spending anything, because the run would not have told you anything true.`,
    ``,
  ];
  for (const finding of report.findings.filter((f) => f.severity === "blocks")) {
    lines.push(`**${finding.message}**`, ``, `- What was found: ${finding.evidence}`);
    if (finding.suggestion) lines.push(`- What to try: ${finding.suggestion}`);
    lines.push(``);
  }
  lines.push(
    `This check passed. A page Buyable cannot measure is not evidence that the page excludes anyone, so it is not treated as a failure.`,
  );
  return lines.join("\n");
}

function renderVerdictTable(report: JourneyReport, personas: PersonaId[]): string {
  const rows = personas
    .map((id) => {
      const v = report.verdicts[id];
      if (!v) return "";
      if (v.attempts === 0) {
        return `| ${PERSONA_LABEL[id] ?? id} | no usable attempts | excluded from the verdict |`;
      }
      const verdict = v.rate === 1 ? "Completed" : v.rate === 0 ? "Never completed" : "Sometimes";
      return `| ${PERSONA_LABEL[id] ?? id} | ${v.completions} of ${v.attempts} | ${verdict} |`;
    })
    .filter(Boolean);

  return [
    `| Persona | Completed | Verdict |`,
    `| --- | --- | --- |`,
    ...rows,
  ].join("\n");
}

/** The transcript of the run that failed, which is the evidence for the failure. */
function renderTranscript(verdict: PersonaVerdict): string {
  const run = (verdict.runs ?? []).find((r) => r.blocker) ?? (verdict.runs ?? [])[0];
  if (!run) return "";

  const lines = [`<details><summary>What ${PERSONA_LABEL[verdict.persona] ?? verdict.persona} did, step by step</summary>`, ``, "```"];
  for (const step of run.steps ?? []) {
    const a = step.action;
    const target = a.selector ?? a.key ?? a.text ?? (a.ref !== undefined ? `node ${a.ref}` : "");
    lines.push(`${String(step.step).padStart(2)}  ${a.action.padEnd(14)} ${target}`);
    const heard = announcementOfStep(step);
    if (heard) lines.push(`    heard: ${heard}`);
    if (step.error) lines.push(`    refused: ${step.error}`);
  }
  lines.push("```", ``, `</details>`);
  return lines.join("\n");
}

function renderFailureSummary(
  report: JourneyReport,
  personas: PersonaId[],
  blocked: PersonaVerdict,
  url: string,
): string {
  const blocker = blocked.blocker!;
  const label = PERSONA_LABEL[blocked.persona] ?? blocked.persona;
  const short = PERSONA_SHORT[blocked.persona] ?? label;

  // Lines that are conditional are dropped as undefined. Empty strings are blank
  // lines and must survive: without them the headings, table and paragraphs run
  // together into one block of markdown.
  const facts: Array<string | undefined> = [
    blocker.selector ? `- Element: \`${blocker.selector}\`` : undefined,
    blocker.node
      ? `- Announced as: \`${blocker.node.name || "(no accessible name)"}\`, ${blocker.node.role}`
      : undefined,
    blocker.wcag.length ? `- WCAG: ${blocker.wcag.join(", ")}` : undefined,
  ];

  return [
    `## Buyable: ${label} could not finish this journey`,
    ``,
    `\`${url}\``,
    ``,
    renderVerdictTable(report, personas),
    ``,
    `**The control completed this journey and ${short} did not.** Same site, same journey, same moment. The only thing that changed is what the customer could perceive, which is what makes the site the variable rather than the model.`,
    ``,
    `### What stopped it`,
    ``,
    `${describeBlocker(blocker)}`,
    ``,
    ...facts.filter((l): l is string => l !== undefined),
    ``,
    `> ${blocker.agentExplanation.slice(0, 500)}`,
    ``,
    `<sub>Recorded verbatim from the persona at the step where it stopped.</sub>`,
    ``,
    renderTranscript(blocked),
  ].join("\n");
}

function renderPassSummary(report: JourneyReport, personas: PersonaId[], url: string): string {
  return [
    `## Buyable: everyone finished`,
    ``,
    `\`${url}\``,
    ``,
    renderVerdictTable(report, personas),
    ``,
    `The same journey completed with a mouse and with the keyboard and accessibility tree alone. Journey Completion Rate ${pct(report.journeyCompletionRate)}.`,
    ``,
    `<sub>${Math.round(report.durationMs / 1000)} seconds, $${report.costUsd.toFixed(4)} of model spend. Buyable measures completion. It does not claim conformance and is not a substitute for an audit by people who use assistive technology every day.</sub>`,
  ].join("\n");
}

function renderPatchSummary(patch: ProposedPatch, applied: boolean): string {
  return [
    ``,
    `### ${applied ? "A fix has been written into the working tree" : "A fix was proposed"}`,
    ``,
    `\`${patch.filePath}\``,
    ``,
    patch.rationale,
    ``,
    "```diff",
    patch.diff,
    "```",
    ``,
    applied
      ? `<sub>The change is in the working tree and nothing has been committed. Opening the pull request is the workflow's decision, not Buyable's.</sub>`
      : `<sub>Nothing was written. Set \`fix: true\` to have the change applied to the checkout.</sub>`,
  ].join("\n");
}

/* ------------------------------------------------------------------------- *
 * The run.
 * ------------------------------------------------------------------------- */

export async function runCi(): Promise<number> {
  const url = input("url");
  const goal = input("goal");
  if (!url || !goal) {
    annotate("error", "Buyable needs both `url` and `goal`.");
    return 1;
  }

  const personas = (input("personas", "assistive") || "assistive")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as PersonaId[];

  // The control is not optional. Without it a failure cannot be attributed to the
  // site, and a check that cannot attribute its failures is an accusation generator.
  if (!personas.includes("baseline")) personas.unshift("baseline");

  const journey = defineJourney({
    name: goal,
    startUrl: url,
    goal,
    assertion: {
      textPresent: input("proof") || undefined,
      urlMatches: input("url-matches") || undefined,
    },
  });

  const provider = createProvider({
    region: process.env.AWS_REGION ?? "us-west-2",
    provider: input("provider") || undefined,
    modelId: input("model") || undefined,
  });

  const artifactDir = input("artifact-dir", "buyable-report");
  mkdirSync(artifactDir, { recursive: true });

  let report: JourneyReport;
  try {
    report = await runJourney({
      region: process.env.AWS_REGION ?? "us-west-2",
      journey,
      personas,
      provider,
      attempts: Number(input("attempts", "1")) || 1,
      preflight: true,
      consentPolicy: "reject",
      onEvent: (e) => {
        if (e.type === "step") {
          const a = e.record.action;
          process.stdout.write(
            `[${e.persona}] ${String(e.record.step).padStart(2)} ${a.action} ${a.selector ?? a.key ?? ""}\n`,
          );
        }
      },
    });
  } catch (err) {
    if (err instanceof JourneyNotFeasible) {
      // Refusing to measure is a result, and it is not the site's failure. Say so
      // clearly, write it down, and let the build through.
      summary(renderRefusalSummary(err.report, url));
      annotate("notice", `Buyable did not run this journey: ${err.message.split("\n")[0]}`);
      setOutput("ran", false);
      setOutput("outcome", "not-feasible");
      writeFileSync(path.join(artifactDir, "feasibility.json"), JSON.stringify(err.report, null, 2));
      return 0;
    }
    const message = err instanceof Error ? err.message : String(err);
    annotate("warning", `Buyable could not complete this run: ${message}`);
    summary(`## Buyable could not complete this run\n\n${message}\n\nThis is an infrastructure failure rather than a finding about the site, so the check has not been failed.`);
    setOutput("ran", false);
    setOutput("outcome", "error");
    return 0;
  }

  writeFileSync(path.join(artifactDir, "report.json"), JSON.stringify(report, null, 2));
  setOutput("ran", true);
  setOutput("completion-rate", report.journeyCompletionRate);
  setOutput("site-is-the-variable", report.siteIsTheVariable);
  setOutput("report-path", path.join(artifactDir, "report.json"));

  const control = report.verdicts.baseline;
  const blocked = personas
    .filter((p) => p !== "baseline")
    .map((p) => report.verdicts[p])
    .find((v): v is PersonaVerdict => !!v && v.attempts > 0 && v.rate < 1 && !!v.blocker);

  // Without a working control there is nothing to compare against, so there is
  // nothing here that can be laid at the site's door.
  const controlGotThrough = !!control && control.attempts > 0 && control.rate === 1;

  if (!blocked || !controlGotThrough) {
    summary(renderPassSummary(report, personas, url));
    setOutput("outcome", controlGotThrough ? "completed" : "inconclusive");
    if (!controlGotThrough) {
      annotate(
        "notice",
        "The control did not finish either, so nothing in this run can be attributed to the site. The check has not been failed.",
      );
    }
    return 0;
  }

  setOutput("outcome", "blocked");
  setOutput("blocked-persona", blocked.persona);
  setOutput("selector", blocked.blocker!.selector ?? "");
  setOutput("wcag", blocked.blocker!.wcag.join(", "));
  setOutput("explanation", blocked.blocker!.agentExplanation);

  let body = renderFailureSummary(report, personas, blocked, url);

  /* ----------------------------------------------------------------------- *
   * The fix, written into the checkout that is already on the runner.
   * ----------------------------------------------------------------------- */
  let patch: ProposedPatch | undefined;
  if (flag("fix")) {
    const sourceRoot = path.resolve(input("source-root", process.env.GITHUB_WORKSPACE ?? "."));
    try {
      patch = await proposePatch({ provider, sourceRoot, blocker: blocked.blocker! });
      writeFileSync(patch.absolutePath, patch.after, "utf8");
      writeFileSync(path.join(artifactDir, "fix.diff"), patch.diff, "utf8");

      setOutput("patch-applied", true);
      setOutput("patch-file", patch.filePath);
      setOutput("patch-diff", patch.diff);
      body += `\n${renderPatchSummary(patch, true)}`;

      annotate(
        "error",
        `${describeBlocker(blocked.blocker!)} Buyable has written a fix into this file.`,
        { file: patch.filePath, line: firstChangedLine(patch.before, patch.after) },
      );
    } catch (err) {
      // Refusing to patch is the correct behaviour far more often than it looks. A
      // diff that applies cleanly to the wrong file reads plausibly and fixes nothing.
      const reason = err instanceof PatchRefused ? err.message : String(err);
      setOutput("patch-applied", false);
      body += `\n\n### No fix was written\n\n${reason}\n\n<sub>Buyable refuses to patch when it cannot identify the source with certainty. A change that applies cleanly to the wrong file is worse than no change.</sub>`;
      annotate("warning", `Buyable found the barrier but did not write a fix: ${reason}`);
    }
  }

  if (!patch) {
    annotate("error", describeBlocker(blocked.blocker!));
  }
  summary(body);

  const failOn = input("fail-on", "blocked").toLowerCase();
  return failOn === "never" ? 0 : 1;
}

/**
 * The renderers, exposed for tests.
 *
 * The check's entire output is a markdown document a reviewer reads in a pull
 * request. It is the product as far as a development team is concerned, and the
 * first version of it collapsed into one unreadable block because a filter meant to
 * drop optional lines dropped every blank line with them. Worth pinning.
 */
export const __testing = {
  renderFailureSummary,
  renderPassSummary,
  renderRefusalSummary,
  renderVerdictTable,
  firstChangedLine,
};

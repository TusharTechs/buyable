/**
 * Evidence bundles.
 *
 * Under the European Accessibility Act the useful artifact is not a score. It is a
 * dated, specific record of what was tested, what happened, and what was changed.
 * A bundle is written for every run, including runs that pass and runs that fall over,
 * because a record that only exists when the answer is interesting is not a record.
 *
 * Bundles land in a bucket with Object Lock in governance mode, so a report cannot be
 * quietly rewritten after the fact.
 */

import type {
  Blocker,
  FixVerification,
  JourneyReport,
  PersonaId,
  PersonaVerdict,
} from "./types.js";
import { describeBlocker } from "./blocker.js";
import { PERSONAS } from "./personas.js";

/** Schema version, so old bundles stay readable when the shape changes. */
export const EVIDENCE_SCHEMA = "buyable.evidence.v1";

export interface EvidenceBundle {
  schema: typeof EVIDENCE_SCHEMA;
  reportId: string;
  createdAt: string;

  subject: {
    journeyName: string;
    startUrl: string;
    goal: string;
    /** How completion was proven, stated so a reader can check it themselves. */
    provenBy: Record<string, string | undefined>;
  };

  method: {
    /** Which model, at which endpoint, decided the actions. */
    reasoningProvider: string;
    /** The managed browser the personas actually drove. */
    browser: string;
    attemptsPerPersona: number;
    personas: Array<{
      id: PersonaId;
      standsFor: string;
      perceives: string[];
      canDo: string[];
    }>;
    /** Stated plainly so nobody has to infer the experimental design. */
    control: string;
  };

  result: {
    journeyCompletionRate: number;
    siteIsTheVariable: boolean;
    perPersona: Array<{
      persona: PersonaId;
      completions: number;
      attempts: number;
      rate: number;
      outcomes: string[];
      browserSessionIds: string[];
      /**
       * Completions that required activating a control with no accessible name.
       * Reported separately because a completion of this kind is not evidence that
       * the journey is usable, only that it is survivable by something willing to
       * act on a guess.
       */
      completionsWithBlindActivation: number;
      blindActivations: Array<{ role: string; selector?: string; inferredPurpose: string }>;
      /** Runs excluded from the denominator because we could not attribute them. */
      inconclusive: number;
    }>;
  };

  findings: Array<{
    persona: PersonaId;
    step: number;
    url: string;
    summary: string;
    kind: string;
    wcag: string[];
    element?: { role: string; accessibleName: string; selector?: string; outerHtml?: string };
    /** The model's own account of what it could not determine, verbatim. */
    agentExplanation: string;
  }>;

  remediation?: {
    filePath: string;
    diff: string;
    rationale: string;
    wcag: string[];
    verification: {
      beforeRate: number;
      afterRate: number;
      delta: number;
      proven: boolean;
    };
  };

  accounting: {
    durationMs: number;
    estimatedModelCostUsd: number;
    /** Labelled as list-price arithmetic, not a billed figure. */
    costBasis: string;
  };
}

function findingFrom(blocker: Blocker) {
  return {
    persona: blocker.persona,
    step: blocker.step,
    url: blocker.url,
    summary: describeBlocker(blocker),
    kind: blocker.kind,
    wcag: blocker.wcag,
    element: blocker.node
      ? {
          role: blocker.node.role,
          accessibleName: blocker.node.name,
          selector: blocker.selector,
          outerHtml: blocker.outerHtml,
        }
      : undefined,
    agentExplanation: blocker.agentExplanation,
  };
}

export function buildEvidenceBundle(args: {
  report: JourneyReport;
  providerId: string;
  personas: Array<{ id: PersonaId; standsFor: string; perceives: string[]; canDo: string[] }>;
  attemptsPerPersona: number;
  fix?: FixVerification;
}): EvidenceBundle {
  const { report, providerId, personas, attemptsPerPersona, fix } = args;

  const verdicts = Object.values(report.verdicts) as PersonaVerdict[];

  return {
    schema: EVIDENCE_SCHEMA,
    reportId: report.reportId,
    createdAt: report.createdAt,

    subject: {
      journeyName: report.journey.name,
      startUrl: report.journey.startUrl,
      goal: report.journey.goal,
      provenBy: {
        urlMatches: report.journey.assertion.urlMatches,
        textPresent: report.journey.assertion.textPresent,
        textAbsent: report.journey.assertion.textAbsent,
      },
    },

    method: {
      reasoningProvider: providerId,
      browser: "Amazon Bedrock AgentCore Browser (aws.browser.v1)",
      attemptsPerPersona,
      personas,
      control:
        "The baseline persona is the control. It perceives the rendered page and uses a pointer. When baseline completes the journey and a constrained persona does not, the site is the variable rather than the model. Runs that failed for infrastructure reasons are excluded from every denominator.",
    },

    result: {
      journeyCompletionRate: report.journeyCompletionRate,
      siteIsTheVariable: report.siteIsTheVariable,
      perPersona: verdicts.map((v) => ({
        persona: v.persona,
        completions: v.completions,
        attempts: v.attempts,
        rate: v.rate,
        outcomes: v.runs.map((r) => r.outcome),
        browserSessionIds: v.runs.map((r) => r.browserSessionId ?? "unknown"),
        completionsWithBlindActivation: v.completionsWithBlindActivation,
        blindActivations: v.blindActivations,
        inconclusive: v.inconclusive,
      })),
    },

    findings: verdicts.flatMap((v) => (v.blocker ? [findingFrom(v.blocker)] : [])),

    remediation: fix
      ? {
          filePath: fix.patch.filePath,
          diff: fix.patch.diff,
          rationale: fix.patch.rationale,
          wcag: fix.patch.wcag,
          verification: {
            beforeRate: fix.before.rate,
            afterRate: fix.after.rate,
            delta: fix.delta,
            proven: fix.proven,
          },
        }
      : undefined,

    accounting: {
      durationMs: report.durationMs,
      estimatedModelCostUsd: Number(report.costUsd.toFixed(4)),
      costBasis:
        "Token counts are measured. The dollar figure is those counts multiplied by published list price, so it is arithmetic rather than a billed amount.",
    },
  };
}

/**
 * Build a bundle straight from a report, filling the method section from the persona
 * definitions rather than making every caller restate them.
 */
export function bundleFromReport(args: {
  report: JourneyReport;
  providerId: string;
  attemptsPerPersona: number;
  fix?: FixVerification;
}): EvidenceBundle {
  const personas = (Object.keys(args.report.verdicts) as PersonaId[]).map((id) => {
    const p = PERSONAS[id];
    const perceives = Object.entries(p.perceive)
      .filter(([, allowed]) => allowed)
      .map(([name]) => name);
    const canDo = Object.entries(p.act)
      .filter(([, allowed]) => allowed)
      .map(([name]) => name);
    return { id, standsFor: p.standsFor, perceives, canDo };
  });

  return buildEvidenceBundle({
    report: args.report,
    providerId: args.providerId,
    personas,
    attemptsPerPersona: args.attemptsPerPersona,
    fix: args.fix,
  });
}

/** Object keys, laid out so a bundle is browsable by hand in the console. */
export function evidenceKeys(reportId: string, createdAt: string) {
  const day = createdAt.slice(0, 10);
  const base = `reports/${day}/${reportId}`;
  return {
    bundle: `${base}/evidence.json`,
    summary: `${base}/summary.md`,
    screenshot: (persona: PersonaId, step: number) => `raw/${day}/${reportId}/${persona}-${step}.png`,
  };
}

/** A short human-readable companion to the JSON, for people who will not open JSON. */
export function renderSummaryMarkdown(bundle: EvidenceBundle): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const lines: string[] = [
    `# Buyable report ${bundle.reportId}`,
    ``,
    `**Journey:** ${bundle.subject.journeyName}`,
    `**Start URL:** ${bundle.subject.startUrl}`,
    `**Run at:** ${bundle.createdAt}`,
    ``,
    `## Verdict`,
    ``,
    `| Persona | Completed | Rate |`,
    `| --- | --- | --- |`,
    ...bundle.result.perPersona.map(
      (p) => `| ${p.persona} | ${p.completions} of ${p.attempts} | ${pct(p.rate)} |`,
    ),
    ``,
    `**Journey Completion Rate: ${pct(bundle.result.journeyCompletionRate)}**`,
    ``,
    bundle.result.siteIsTheVariable
      ? `The baseline control completed this journey every time and at least one constrained persona never did. The site is the variable, not the model.`
      : `The baseline control did not complete this journey cleanly, so no claim is made about the constrained personas.`,
    ``,
  ];

  if (bundle.method.attemptsPerPersona < 3) {
    lines.push(
      `> **This run used ${bundle.method.attemptsPerPersona} attempt${bundle.method.attemptsPerPersona === 1 ? "" : "s"} per persona, so treat it as indicative rather than conclusive.**`,
      `> Model behaviour varies between runs. We have measured the AI agent persona both stopping at an unlabelled control and guessing past it on separate attempts against an identical page. Run three attempts or more for a result worth quoting.`,
      ``,
    );
  }

  const guessing = bundle.result.perPersona.filter((p) => p.completionsWithBlindActivation > 0);
  if (guessing.length) {
    lines.push(`## Completions that were guesses`, ``);
    for (const p of guessing) {
      lines.push(
        `**${p.persona}** completed this journey ${p.completions} of ${p.attempts} times, and ${p.completionsWithBlindActivation} of those completions required activating a control with no accessible name.`,
        ``,
        `A screen reader user cannot do this, because not knowing what a control does is precisely why they stop. An agent can, and did, because it acts on inference. What it inferred:`,
        ``,
      );
      for (const b of p.blindActivations) {
        lines.push(`- \`<${b.role}>\`${b.selector ? ` \`${b.selector}\`` : ""}: ${b.inferredPurpose}`);
      }
      lines.push(``);
    }
  }

  if (bundle.findings.length) {
    lines.push(`## What stopped them`, ``);
    for (const f of bundle.findings) {
      lines.push(
        `### ${f.persona}, step ${f.step}`,
        ``,
        f.summary,
        ``,
        f.element
          ? `- Element: \`<${f.element.role}>\` with accessible name ${f.element.accessibleName ? `"${f.element.accessibleName}"` : "(empty)"}`
          : `- Element: not identified`,
        f.element?.selector ? `- Selector: \`${f.element.selector}\`` : ``,
        f.wcag.length ? `- WCAG: ${f.wcag.join(", ")}` : ``,
        ``,
        `> ${f.agentExplanation}`,
        ``,
      );
    }
  }

  if (bundle.remediation) {
    const r = bundle.remediation;
    lines.push(
      `## Remediation`,
      ``,
      `\`${r.filePath}\``,
      ``,
      "```diff",
      r.diff,
      "```",
      ``,
      r.rationale,
      ``,
      r.verification.proven
        ? `Re-running the same journey with the same persona on the patched build moved completion from ${pct(r.verification.beforeRate)} to ${pct(r.verification.afterRate)}.`
        : `The patch did not move completion, so it is reported as unproven rather than as a fix.`,
      ``,
    );
  }

  lines.push(
    `## Method`,
    ``,
    `- Reasoning: ${bundle.method.reasoningProvider}`,
    `- Browser: ${bundle.method.browser}`,
    `- Attempts per persona: ${bundle.method.attemptsPerPersona}`,
    ``,
    bundle.method.control,
    ``,
    `Model cost for this report: $${bundle.accounting.estimatedModelCostUsd.toFixed(4)}. ${bundle.accounting.costBasis}`,
  );

  return lines.filter((l) => l !== undefined).join("\n");
}

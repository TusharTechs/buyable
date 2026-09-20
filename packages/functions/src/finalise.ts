/**
 * Step Functions task: write the evidence and publish the page.
 *
 * The last state in every path, including the ones that failed, because a record that
 * only exists when the answer is interesting is not a record. A run that fell over
 * still produces a page saying so.
 */

import {
  bundleFromReport,
  renderReportHtml,
  renderSummaryMarkdown,
  summariseRuns,
  evidenceKeys,
  type Journey,
  type JourneyReport,
  type PersonaId,
  type PersonaRunResult,
} from "@buyable/engine";
import {
  EVIDENCE_BUCKET,
  WEB_BUCKET,
  WEB_BASE_URL,
  getProvider,
  putObject,
  putRun,
  getRun,
} from "./shared.js";

export interface FinaliseInput {
  runId: string;
  journey: Journey;
  attempts: number;
  report: JourneyReport;
  remediation?: {
    patched: boolean;
    reason?: string;
    patch?: any;
    shadowStartUrl?: string;
  };
  /** Re-run results against the patched build, when the fix branch ran. */
  verificationRuns?: PersonaRunResult[];
  failingPersona?: PersonaId;
}

export async function handler(input: FinaliseInput) {
  const provider = await getProvider();

  let fix;
  if (input.remediation?.patched && input.remediation.patch && input.verificationRuns?.length) {
    const persona = input.failingPersona!;
    const after = summariseRuns({
      journey: input.journey,
      reportId: `${input.runId}-verify`,
      runsByPersona: { [persona]: input.verificationRuns },
    }).verdicts[persona]!;

    const before = input.report.verdicts[persona]!;
    fix = {
      patch: input.remediation.patch,
      before,
      after,
      delta: after.rate - before.rate,
      // The bar: the persona must now actually complete, and be better than before.
      // A patch that merely reduces violations does not clear it.
      proven: after.rate > before.rate && after.completions > 0,
    };
  }

  const bundle = bundleFromReport({
    report: input.report,
    providerId: provider.id,
    attemptsPerPersona: input.attempts,
    fix,
  });

  const keys = evidenceKeys(input.runId, bundle.createdAt);

  await Promise.all([
    putObject({
      bucket: EVIDENCE_BUCKET,
      key: keys.bundle,
      body: JSON.stringify(bundle, null, 2),
      contentType: "application/json",
    }),
    putObject({
      bucket: EVIDENCE_BUCKET,
      key: keys.summary,
      body: renderSummaryMarkdown(bundle),
      contentType: "text/markdown; charset=utf-8",
    }),
    putObject({
      bucket: WEB_BUCKET,
      key: `reports/${input.runId}.html`,
      body: renderReportHtml(bundle, { siteUrl: WEB_BASE_URL }),
      contentType: "text/html; charset=utf-8",
      // Reports are immutable once written, so they can be cached hard. The evidence
      // bucket holds the authoritative copy under Object Lock either way.
      cacheControl: "public, max-age=3600",
    }),
  ]);

  const existing = await getRun(input.runId);
  await putRun({
    runId: input.runId,
    status: "complete",
    createdAt: existing?.createdAt ?? bundle.createdAt,
    updatedAt: new Date().toISOString(),
    journey: input.journey,
    reportUrl: `${WEB_BASE_URL}/reports/${input.runId}.html`,
  });

  return {
    runId: input.runId,
    reportUrl: `${WEB_BASE_URL}/reports/${input.runId}.html`,
    journeyCompletionRate: bundle.result.journeyCompletionRate,
    proven: fix?.proven ?? false,
  };
}

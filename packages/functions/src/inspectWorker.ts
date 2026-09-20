/**
 * The free inspection, done properly, out of band.
 *
 * This used to happen inside the POST. The endpoint's own comment said "a page
 * inspection takes about six seconds, comfortably inside the API Gateway limit", and
 * that was true of the version that slept three seconds and read whatever was there.
 *
 * It is not true any more, and the reason is the point. Reading a page before it has
 * finished loading reported five unlabelled controls on a government portal where
 * every one of them was labelled. The inspection now waits for the document to finish
 * and the network to go quiet, which on a heavy retail page takes over a minute.
 *
 * A minute does not fit in a thirty second API Gateway integration, so the work moved
 * behind an asynchronous invoke and the caller polls. The alternative was to keep the
 * endpoint fast by keeping the measurement wrong, which is not a trade worth making
 * for a tool whose only real product is not being wrong.
 */

import { randomUUID } from "node:crypto";
import { inspectPage, renderInspectionHtml, withBrowserSession } from "@buyable/engine";
import { putInspection, putObject, REGION, WEB_BUCKET, WEB_BASE_URL } from "./shared.js";

export interface InspectWorkerInput {
  inspectionId: string;
  url: string;
}

export async function handler(input: InspectWorkerInput) {
  const { inspectionId, url } = input;

  try {
    const report = await withBrowserSession(
      { region: REGION, name: `buyable-inspect-${inspectionId.slice(0, 8)}`, timeoutSeconds: 180 },
      (page) => inspectPage(page, url),
    );

    await putObject({
      bucket: WEB_BUCKET,
      key: `inspections/${inspectionId}.html`,
      body: renderInspectionHtml(report, { siteUrl: WEB_BASE_URL }),
      contentType: "text/html; charset=utf-8",
      cacheControl: "public, max-age=3600",
    });

    await putInspection({
      inspectionId,
      status: "complete",
      url: report.finalUrl,
      requestedUrl: url,
      title: report.title,
      durationMs: report.durationMs,
      counts: report.counts,
      tabStops: report.transcript.length,
      notTheRealPage: report.notTheRealPage,
      reportUrl: `${WEB_BASE_URL}/inspections/${inspectionId}.html`,
      findings: report.findings.map((f) => ({
        kind: f.kind,
        severity: f.severity,
        summary: f.summary,
        selector: f.selector,
        announcement: f.announcement,
        wcag: f.wcag,
        occurrences: f.occurrences,
      })),
      transcript: report.transcript.slice(0, 25),
      limits: report.limits,
    });
  } catch (err) {
    console.error("inspection failed", err);
    await putInspection({
      inspectionId,
      status: "failed",
      requestedUrl: url,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { inspectionId };
}

/** Exported for the starter, so both sides agree on how an id is made. */
export function newInspectionId(): string {
  return randomUUID();
}

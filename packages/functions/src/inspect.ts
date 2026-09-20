/**
 * POST /inspect
 *
 * The free tier. Deterministic, so it needs no model, no key and no quota, and the
 * only thing it consumes is a few seconds of managed browser. That is why it can be
 * offered without the caps the journey endpoint needs.
 *
 * Synchronous on purpose. A page inspection takes about six seconds, comfortably
 * inside the API Gateway limit, and a caller who gets an answer in one request does
 * not need a status endpoint, a polling loop or a run record. The journey endpoint
 * needs all three because it takes minutes; this one does not, and pretending
 * otherwise would be architecture for its own sake.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { inspectPage, renderInspectionHtml, withBrowserSession } from "@buyable/engine";
import { assertNotHalted, assertRobotsAllows, assertUrlIsFetchable, Refused } from "./guards.js";
import { json, putObject, REGION, WEB_BUCKET, WEB_BASE_URL } from "./shared.js";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Body must be JSON." });
  }

  try {
    await assertNotHalted();

    const url = assertUrlIsFetchable(String(body.url ?? ""));
    await assertRobotsAllows(url);

    // No rate limiting beyond the guards above. This costs fractions of a cent and
    // makes no model calls, so capping it would be protecting nothing.

    const inspectionId = randomUUID();
    const report = await withBrowserSession(
      { region: REGION, name: `buyable-inspect-${inspectionId.slice(0, 8)}`, timeoutSeconds: 120 },
      (page) => inspectPage(page, url.toString()),
    );

    await putObject({
      bucket: WEB_BUCKET,
      key: `inspections/${inspectionId}.html`,
      body: renderInspectionHtml(report, { siteUrl: WEB_BASE_URL }),
      contentType: "text/html; charset=utf-8",
      cacheControl: "public, max-age=3600",
    });

    return json(200, {
      inspectionId,
      reportUrl: `${WEB_BASE_URL}/inspections/${inspectionId}.html`,
      url: report.finalUrl,
      title: report.title,
      durationMs: report.durationMs,
      counts: report.counts,
      tabStops: report.transcript.length,
      // Enough to render a useful result inline without fetching the page.
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
    if (err instanceof Refused) return json(err.status, { error: err.message });
    console.error("inspect failed", err);
    return json(500, { error: "Could not inspect that page." });
  }
}

/**
 * GET /runs/{runId}
 *
 * Progress for a run in flight. Deliberately small: the finished artifact is a static
 * HTML page written to S3, so this endpoint exists only for the window before that
 * page exists and never becomes the thing people link to.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { getReportGrant, getRun, listEvents, json, WEB_BASE_URL } from "./shared.js";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const runId = event.pathParameters?.runId;
  if (!runId) return json(400, { error: "No run id." });

  const record = await getRun(runId);
  if (!record) return json(404, { error: "No such run." });

  // Only the state of the grant, never the digest and certainly never a key.
  const grant = await getReportGrant(runId);

  return json(200, {
    runId,
    status: record.status,
    progress: record.progress ?? {},
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    // The path only. This endpoint has no key and could not produce one: the caller
    // who started the run is holding it, and nobody else is meant to.
    reportUrl: record.status === "complete" ? `${WEB_BASE_URL}/r/${runId}` : undefined,
    reportExpiresAt: grant?.expiresAt,
    reportRevoked: !!grant?.revokedAt,
    events: await listEvents(runId),
  });
}

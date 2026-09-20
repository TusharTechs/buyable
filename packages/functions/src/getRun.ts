/**
 * GET /runs/{runId}
 *
 * Progress for a run in flight. Deliberately small: the finished artifact is a static
 * HTML page written to S3, so this endpoint exists only for the window before that
 * page exists and never becomes the thing people link to.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { getRun, listEvents, json, WEB_BASE_URL } from "./shared.js";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const runId = event.pathParameters?.runId;
  if (!runId) return json(400, { error: "No run id." });

  const record = await getRun(runId);
  if (!record) return json(404, { error: "No such run." });

  return json(200, {
    runId,
    status: record.status,
    progress: record.progress ?? {},
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    reportUrl: record.status === "complete" ? `${WEB_BASE_URL}/reports/${runId}.html` : undefined,
    events: await listEvents(runId),
  });
}

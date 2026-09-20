/**
 * POST /inspect
 *
 * The free tier. Deterministic, so it needs no model, no key and no quota, and the
 * only thing it consumes is a few seconds of managed browser. That is why it can be
 * offered without the caps the journey endpoint needs.
 *
 * Asynchronous, which it did not used to be.
 *
 * This ran inside the request for as long as an inspection took about six seconds,
 * and the comment here said so. That stopped being true when the inspection started
 * waiting for pages to finish loading, which it now does because reading one early
 * reported five unlabelled controls on a government portal that had labelled every
 * one of them. A heavy retail page takes over a minute to settle.
 *
 * A minute does not fit in a thirty second API Gateway integration. So this validates,
 * records, hands the work to inspectWorker and returns immediately, and the caller
 * polls GET /inspections/{id}. Keeping the endpoint fast by keeping the measurement
 * wrong was the other option.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { assertNotHalted, assertRobotsAllows, assertUrlIsFetchable, Refused } from "./guards.js";
import { getInspection, json, putInspection } from "./shared.js";

const lambda = new LambdaClient({});

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
    await putInspection({ inspectionId, status: "queued", requestedUrl: url.toString() });

    // Event, not RequestResponse: this returns as soon as Lambda has accepted the
    // work, which is the whole point.
    await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.INSPECT_WORKER_ARN!,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify({ inspectionId, url: url.toString() })),
      }),
    );

    return json(202, {
      inspectionId,
      status: "queued",
      statusUrl: `/inspections/${inspectionId}`,
      note: "Buyable waits for the page to finish loading before reading it, which takes fifteen to sixty seconds depending on the site. Reading early makes a page look worse than it is.",
    });
  } catch (err) {
    if (err instanceof Refused) return json(err.status, { error: err.message });
    console.error("inspect failed", err);
    return json(500, { error: "Could not inspect that page." });
  }
}

/** GET /inspections/{inspectionId} */
export async function status(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const inspectionId = event.pathParameters?.inspectionId;
  if (!inspectionId) return json(400, { error: "No inspection id." });

  const record = await getInspection(inspectionId);
  if (!record) return json(404, { error: "No such inspection." });
  return json(200, record);
}

/**
 * GET  /reports/{runId}          read a report, with its key
 * POST /reports/{runId}/revoke   kill the key, permanently
 *
 * Reports used to be plain objects on a public CDN. The defence was that the run id
 * is a UUID, so nobody can guess the address. That was true and it was not enough: an
 * unguessable address still ends up in browser history, in a Referer header, in a chat
 * that renders a link preview, in a support ticket, and in the logs of everything it
 * passes through. Once it leaked there was no expiry, no revocation, and no way to
 * know it had happened.
 *
 * Now the report is written to the private evidence bucket and this is the only way to
 * read one. See reportAccess.ts in the engine for the rules; this file is the storage
 * and the HTTP around them.
 *
 * Where the key travels matters as much as what it is. In order of preference:
 *
 *  1. The URL fragment, which is what the viewer at /r/{runId} uses. A fragment is
 *     never sent to any server, so it appears in no access log anywhere, and the
 *     viewer strips it from the address bar after reading it.
 *  2. The `x-buyable-key` header, for curl and for CI.
 *  3. `?k=`, which works and is the worst of the three, because a query string is
 *     written to the access log of every hop. It exists because people paste URLs.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  decideAccess,
  describeRefusal,
  hashReportKey,
  reportSecurityHeaders,
} from "@buyable/engine";
import {
  EVIDENCE_BUCKET,
  getObjectText,
  getReportGrant,
  json,
  recordReportAccess,
  revokeReport,
} from "./shared.js";

export function reportKeyFor(runId: string): string {
  return `reports/${runId}.html`;
}

/** Pull the key from wherever the caller put it, preferring the places that do not log. */
function presentedKey(event: APIGatewayProxyEventV2): string | undefined {
  const headers = event.headers ?? {};
  const direct = headers["x-buyable-key"] ?? headers["X-Buyable-Key"];
  if (direct) return direct.trim();

  const auth = headers.authorization ?? headers.Authorization;
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();

  const query = event.queryStringParameters?.k;
  return query ? query.trim() : undefined;
}

/**
 * A refusal a person can act on, rendered as a page rather than as JSON.
 *
 * Somebody following a link that has expired is not an API client, and answering them
 * with a JSON error object tells them nothing they can use.
 */
function refusalPage(status: number, message: string, heading = "This report is not available"): APIGatewayProxyResultV2 {
  const escaped = message.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return {
    statusCode: status,
    headers: { ...reportSecurityHeaders(), "content-type": "text/html; charset=utf-8" },
    body: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${heading}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; display: grid; place-items: center; min-height: 100vh;
         font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: Canvas; color: CanvasText; }
  main { max-width: 46ch; padding: 24px; }
  h1 { font-size: 22px; letter-spacing: -0.02em; margin: 0 0 12px; }
  p { margin: 0 0 12px; }
</style>
</head>
<body>
<main>
  <h1>${heading}</h1>
  <p>${escaped}</p>
  <p><a href="/">Run a new one</a></p>
</main>
</body>
</html>`,
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const runId = event.pathParameters?.runId;
  if (!runId) return json(400, { error: "No run id." });

  const key = presentedKey(event);
  const grant = await getReportGrant(runId);
  const decision = decideAccess(grant, key);

  const revoking = event.requestContext?.http?.method === "POST";

  if (!decision.allowed) {
    const { status, message } = describeRefusal(decision.reason);
    // An API caller asked for JSON; a person following a link did not. Revocation is
    // only ever called by a program, so it always answers in JSON.
    if (revoking || (event.headers?.accept ?? "").includes("application/json")) {
      return {
        statusCode: status,
        headers: { ...reportSecurityHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ error: message }),
      };
    }
    return refusalPage(status, message);
  }

  if (revoking) {
    const revoked = await revokeReport(runId, hashReportKey(key!));
    return {
      statusCode: revoked ? 200 : 409,
      headers: { ...reportSecurityHeaders(), "content-type": "application/json" },
      body: JSON.stringify(
        revoked
          ? {
              runId,
              revoked: true,
              message:
                "This report is now unreadable, including to anyone already holding the link. Revocation is permanent and cannot be undone.",
            }
          : { error: "The report could not be revoked. Its key may have changed." },
      ),
    };
  }

  const html = await getObjectText(EVIDENCE_BUCKET, reportKeyFor(runId));
  if (!html) {
    // The grant exists but the document does not, which means the run has not
    // finished. That is a different answer from "you may not read this".
    // A run that has not finished is a different answer from one you may not read,
    // and heading it "not available" reads as a refusal when it is a wait.
    return refusalPage(
      404,
      "This run has not finished yet. Keep the link: it will work as soon as there is a report.",
      "This report is not ready yet",
    );
  }

  // Deliberately not awaited. A counter that cannot be written is not a reason to
  // keep somebody from a report they hold the key to.
  void recordReportAccess(runId);

  return {
    statusCode: 200,
    headers: { ...reportSecurityHeaders(), "content-type": "text/html; charset=utf-8" },
    body: html,
  };
}

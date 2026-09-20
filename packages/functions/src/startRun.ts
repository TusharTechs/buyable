/**
 * POST /runs
 *
 * The public entry point. Everything risky about this product is concentrated here,
 * so the order of checks matters: refuse for free before anything is started, and
 * never start an execution that the guards would have stopped.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { randomUUID } from "node:crypto";
import {
  checkFeasibility,
  defineJourney,
  PERSONA_IDS,
  withBrowserSession,
  type PersonaId,
} from "@buyable/engine";
import { assertNotHalted, assertRobotsAllows, assertUrlIsFetchable, assertWithinLimits, Refused } from "./guards.js";
import { json, putRun, REGION, WEB_BASE_URL } from "./shared.js";

const sfn = new SFNClient({});

/** Public scans are capped well below what the CLI allows, for cost and for patience. */
const MAX_PUBLIC_ATTEMPTS = 2;

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Body must be JSON." });
  }

  const ip = event.requestContext?.http?.sourceIp ?? "unknown";

  try {
    await assertNotHalted();

    const url = assertUrlIsFetchable(String(body.url ?? ""));
    await assertRobotsAllows(url);
    await assertWithinLimits({ ip, url });

    const goal = String(body.goal ?? "").trim();
    if (goal.length < 10) {
      return json(400, {
        error: "Describe the goal in a sentence, for example: add a product to the basket and reach the checkout page.",
      });
    }

    const textPresent = body.textPresent ? String(body.textPresent) : undefined;
    const urlMatches = body.urlMatches ? String(body.urlMatches) : undefined;
    if (!textPresent && !urlMatches) {
      // Without an assertion there is no way to prove completion, and a report that
      // cannot prove completion is exactly the kind of thing this project exists to
      // stop people shipping.
      return json(400, {
        error:
          "Give a way to prove the journey finished: either textPresent, some words that appear only on the final page, or urlMatches, a pattern the final URL matches.",
      });
    }

    const requested = Array.isArray(body.personas) ? (body.personas as string[]) : PERSONA_IDS;
    const personas = requested.filter((p): p is PersonaId =>
      (PERSONA_IDS as string[]).includes(p),
    );
    if (personas.length === 0) return json(400, { error: "No valid personas requested." });
    if (!personas.includes("baseline")) {
      // The control is not optional. Without it a failure cannot be attributed to the
      // site rather than to the model, and the result would not be worth reporting.
      personas.unshift("baseline");
    }

    const attempts = Math.min(
      MAX_PUBLIC_ATTEMPTS,
      Math.max(1, Number(body.attempts ?? MAX_PUBLIC_ATTEMPTS)),
    );

    const journey0 = defineJourney({
      name: String(body.name ?? goal).slice(0, 140),
      startUrl: url.toString(),
      goal,
      assertion: { textPresent, urlMatches },
    });

    // Decide whether this journey is worth starting before the caller waits minutes
    // for an answer that was never going to mean anything. One page load, no model,
    // a few seconds. A refusal here is a specific refusal: what was found, what it
    // means, and what to do instead.
    const feasibility = await withBrowserSession(
      { region: REGION, name: `buyable-preflight-${journey0.journeyId.slice(0, 8)}`, timeoutSeconds: 120 },
      (page) => checkFeasibility(page, journey0, personas),
    );

    if (!feasibility.canRun) {
      return json(422, {
        error: "This journey will not run, and here is why.",
        canRun: false,
        checkedIn: `${Math.round(feasibility.durationMs / 1000)}s`,
        page: { url: feasibility.finalUrl, title: feasibility.title, reachableControls: feasibility.tabStops },
        reasons: feasibility.findings.filter((f) => f.severity === "blocks"),
        warnings: feasibility.findings.filter((f) => f.severity === "warns"),
      });
    }

    const runId = journey0.journeyId;
    const journey = journey0;

    await putRun({
      runId,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      journey,
      progress: Object.fromEntries(personas.map((p) => [p, "queued"])),
    });

    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: process.env.STATE_MACHINE_ARN!,
        name: runId,
        input: JSON.stringify({
          runId,
          journey,
          personas,
          attempts,
          // Step Functions Map iterates a list, so the attempt count has to arrive as
          // one. Building it here keeps the state machine free of arithmetic.
          attemptIndices: Array.from({ length: attempts }, (_, i) => i + 1),
          // Public scans never remediate: we do not hold the source for somebody
          // else's site and would be guessing at a repository we cannot see.
          fix: false,
          sourceRoot: null,
        }),
      }),
    );

    return json(202, {
      runId,
      status: "queued",
      statusUrl: `/runs/${runId}`,
      reportUrl: `${WEB_BASE_URL}/reports/${runId}.html`,
      personas,
      attempts,
      // Anything the preflight noticed but did not consider fatal, so the caller can
      // read the eventual result knowing what stood in the way.
      warnings: feasibility.findings.filter((f) => f.severity === "warns"),
      note: "Buyable will attempt this journey as each persona. Public scans are read only: no forms are submitted on sites we do not own.",
    });
  } catch (err) {
    if (err instanceof Refused) return json(err.status, { error: err.message });
    console.error("startRun failed", err);
    return json(500, { error: "Something went wrong starting that run." });
  }
}

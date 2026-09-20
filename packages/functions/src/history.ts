/**
 * GET /me/runs                    what I have run
 * GET /me/journeys/{journeyKey}   how one journey has behaved over time
 *
 * The second one is the reason accounts exist here. A single scan tells you whether a
 * checkout works today. The sentence worth paying for is "this worked on the 12th and
 * does not work now", and nothing can say that without a record of the 12th.
 *
 * Both endpoints read from a secondary index rather than from the reports. Drawing a
 * list by fetching thirty reports out of S3 would work on the day it was written and
 * would get slower every week, which is a poor property for the one feature whose
 * entire purpose is to keep looking further back.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { describeTrend } from "@buyable/engine";
import {
  callerId,
  json,
  listRunsByJourney,
  listRunsByOwner,
  ownerKeyFor,
  type RunListRow,
} from "./shared.js";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const caller = callerId(event);
  if (!caller) {
    // The authorizer should have refused this already. Refusing again rather than
    // trusting that is the difference between one control and two.
    return json(401, { error: "Sign in to see your runs." });
  }
  const ownerKey = ownerKeyFor(caller);

  const journeyKey = event.pathParameters?.journeyKey;
  if (!journeyKey) {
    const runs = await listRunsByOwner(ownerKey);

    // One row per journey as well as the flat list, because "which of my journeys is
    // broken" is a different question from "what did I run this morning" and a list
    // of runs answers it badly.
    const journeys = new Map<string, { key: string; label: string; goal: string; runs: number; latest: RunListRow }>();
    for (const run of runs) {
      if (!run.journeyKey) continue;
      const existing = journeys.get(run.journeyKey);
      if (existing) {
        existing.runs += 1;
        continue;
      }
      // Runs arrive newest first, so the first of each journey is its latest.
      journeys.set(run.journeyKey, {
        key: run.journeyKey,
        label: run.journeyLabel ?? run.startUrl ?? "a journey",
        goal: run.journeyGoal ?? "",
        runs: 1,
        latest: run,
      });
    }

    return json(200, { runs, journeys: [...journeys.values()] });
  }

  const rows = await listRunsByJourney(journeyKey);

  /*
   * The tenant boundary.
   *
   * A journey key already contains the owner's subject, so constructing somebody
   * else's requires already knowing it. That argument is probably sound and is not
   * worth resting a tenant boundary on, so every row is checked against the caller
   * regardless. If any row belongs to somebody else, the whole thing is refused
   * rather than filtered: a partition holding two owners means an assumption in this
   * system is wrong, and quietly returning the subset would hide that.
   */
  const foreign = rows.find((row) => (row as { ownerKey?: string }).ownerKey !== ownerKey);
  if (rows.length > 0 && foreign) {
    console.error("journey partition held a row for another owner", { journeyKey });
    return json(404, { error: "No such journey." });
  }
  if (rows.length === 0) return json(404, { error: "No such journey." });

  const latest = rows[rows.length - 1]!;
  return json(200, {
    journeyKey,
    label: latest.journeyLabel ?? latest.startUrl,
    goal: latest.journeyGoal,
    startUrl: latest.startUrl,
    runs: rows,
    change: describeTrend(rows),
  });
}

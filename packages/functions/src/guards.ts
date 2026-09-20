/**
 * What stands between a stranger's text box and an autonomous browser.
 *
 * Buyable lets anyone point a real browser agent at a URL of their choosing. That is
 * the feature: a report on a site we picked proves much less than a report on a site
 * the reader picked. It is also, unguarded, a request forgery service with a spend
 * meter attached, so every check below exists because of a specific way that goes
 * wrong rather than as general caution.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  // A journey with no urlMatches carries the key as undefined, and the marshaller
  // rejects that by default rather than dropping it. Dropping is what we want: an
  // absent assertion and an assertion set to undefined mean the same thing here.
  marshallOptions: { removeUndefinedValues: true },
});
const TABLE = process.env.RUNS_TABLE!;

export class Refused extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Addresses that must never be fetched from inside our account.
 *
 * 169.254.169.254 is the one that matters most: it is the EC2 instance metadata
 * endpoint, and a fetch to it from our own network is how credentials leave a cloud
 * account. The private ranges are here because a URL can resolve into them, and
 * because "scan my internal admin panel" is not a service we offer.
 */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /\.internal$/i,
  /\.local$/i,
  /^metadata\./i,
];

export function assertUrlIsFetchable(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Refused("That is not a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Refused("Only http and https URLs can be scanned.");
  }

  const host = url.hostname;
  for (const pattern of BLOCKED_HOST_PATTERNS) {
    if (pattern.test(host)) {
      throw new Refused(
        "That host is not reachable from here. Buyable only scans sites on the public internet.",
      );
    }
  }

  // A bare hostname with no dot is either a local name or an internal service.
  if (!host.includes(".")) {
    throw new Refused("That host does not look like a public domain.");
  }

  return url;
}

const USER_AGENT = "BuyableBot";

/**
 * Honour robots.txt.
 *
 * Not legally required for what we do, and observed anyway: a site that has asked
 * automated clients to stay out of its checkout has said something clear, and a tool
 * whose entire subject is respecting how people want to use the web would look
 * ridiculous ignoring it. Failing open on a missing or unreadable robots.txt is
 * deliberate, since absence of a file is not a refusal.
 */
export async function assertRobotsAllows(url: URL): Promise<void> {
  const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;

  let body: string;
  try {
    const response = await fetch(robotsUrl, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return;
    body = await response.text();
  } catch {
    return;
  }

  // Collect the rules that apply to us: our own name wins over the wildcard group.
  const lines = body.split("\n").map((l) => l.replace(/#.*$/, "").trim());
  const groups: Array<{ agents: string[]; disallow: string[] }> = [];
  let current: { agents: string[]; disallow: string[] } | undefined;
  let lastWasAgent = false;

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "disallow" && current) {
      if (value) current.disallow.push(value);
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const named = groups.find((g) => g.agents.includes(USER_AGENT.toLowerCase()));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const rules = named ?? wildcard;
  if (!rules) return;

  const path = url.pathname || "/";
  for (const prefix of rules.disallow) {
    if (prefix === "/" || path.startsWith(prefix)) {
      throw new Refused(
        `That site's robots.txt asks automated clients not to visit ${path}, so Buyable will not.`,
        403,
      );
    }
  }
}

/**
 * Rate limits and the spend kill switch.
 *
 * Counters live in DynamoDB with a TTL rather than in memory, because Lambda
 * concurrency means in-memory counters count nothing. Each limit is a separate item
 * so a noisy caller cannot exhaust the global budget on its own, and the global
 * budget still stops everything if it does.
 */
async function bump(key: string, ttlSeconds: number): Promise<number> {
  const result = await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `limit#${key}`, sk: "counter" },
      UpdateExpression: "ADD #n :one SET #ttl = if_not_exists(#ttl, :ttl)",
      ExpressionAttributeNames: { "#n": "count", "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":one": 1,
        ":ttl": Math.floor(Date.now() / 1000) + ttlSeconds,
      },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  return Number(result.Attributes?.count ?? 0);
}

export interface Limits {
  perIpPerHour: number;
  perDomainPerDay: number;
  globalPerDay: number;
}

/**
 * Deliberately low.
 *
 * The binding constraint is not AWS, where a full three persona run costs about a
 * penny. It is the reasoning provider bill, where the same run is closer to a dollar.
 * The global cap is therefore set by what a day of public scanning is allowed to cost
 * on that bill, not by what the infrastructure could comfortably serve.
 */
export const DEFAULT_LIMITS: Limits = {
  perIpPerHour: Number(process.env.LIMIT_IP_PER_HOUR ?? 3),
  perDomainPerDay: Number(process.env.LIMIT_DOMAIN_PER_DAY ?? 5),
  globalPerDay: Number(process.env.LIMIT_GLOBAL_PER_DAY ?? 40),
};

export async function assertWithinLimits(args: {
  ip: string;
  url: URL;
  limits?: Limits;
}): Promise<void> {
  const limits = args.limits ?? DEFAULT_LIMITS;
  const today = new Date().toISOString().slice(0, 10);
  const hour = new Date().toISOString().slice(0, 13);

  const [globalCount, ipCount, domainCount] = await Promise.all([
    bump(`global#${today}`, 60 * 60 * 26),
    bump(`ip#${args.ip}#${hour}`, 60 * 60 * 2),
    bump(`domain#${args.url.hostname}#${today}`, 60 * 60 * 26),
  ]);

  // The global cap is checked first and deliberately worded as our limit, not the
  // caller's fault, because at that point it is not.
  if (globalCount > limits.globalPerDay) {
    throw new Refused(
      "Buyable has hit its daily budget for public scans. It resets at midnight UTC.",
      429,
    );
  }
  if (ipCount > limits.perIpPerHour) {
    throw new Refused(
      `That is more than ${limits.perIpPerHour} scans in an hour. Please wait a little.`,
      429,
    );
  }
  if (domainCount > limits.perDomainPerDay) {
    throw new Refused(
      `That domain has already been scanned ${limits.perDomainPerDay} times today.`,
      429,
    );
  }
}

/**
 * A manual stop, independent of the counters.
 *
 * Set by writing a single DynamoDB item. The counters protect against ordinary
 * overuse; this exists for the case where something is wrong and the answer is to
 * stop now, without a deploy.
 */
export async function assertNotHalted(): Promise<void> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { pk: "control#halt", sk: "state" } }),
  );
  if (result.Item?.halted) {
    throw new Refused(
      typeof result.Item.reason === "string"
        ? result.Item.reason
        : "Public scanning is paused right now.",
      503,
    );
  }
}

/**
 * Shared plumbing for the Lambda handlers.
 *
 * Clients are created at module scope so they are reused across warm invocations,
 * and the API key is fetched once and cached for the life of the container rather
 * than on every request, because Secrets Manager charges per call and a persona run
 * makes dozens of model calls behind one secret read.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createProvider, type ReasoningProvider } from "@buyable/engine";

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  // A journey with no urlMatches carries the key as undefined, and the marshaller
  // rejects that by default rather than dropping it. Dropping is what we want: an
  // absent assertion and an assertion set to undefined mean the same thing here.
  marshallOptions: { removeUndefinedValues: true },
});
export const s3 = new S3Client({});

export const TABLE = process.env.RUNS_TABLE!;
export const EVIDENCE_BUCKET = process.env.EVIDENCE_BUCKET!;
export const WEB_BUCKET = process.env.WEB_BUCKET!;
export const SHADOW_BUCKET = process.env.SHADOW_BUCKET!;
export const SHADOW_BASE_URL = process.env.SHADOW_BASE_URL!;
export const WEB_BASE_URL = process.env.WEB_BASE_URL!;
export const REGION = process.env.AWS_REGION ?? "us-west-2";

let cachedProvider: ReasoningProvider | undefined;

/**
 * The reasoning provider, built from whatever this deployment is configured to use.
 *
 * BUYABLE_PROVIDER decides. Bedrock reads no secret at all, which is the intended
 * shape; the others exist because this account cannot invoke Bedrock models. See
 * docs/adr/0002.
 *
 * Whichever is selected must have passed tools/validate-provider.mjs first. The
 * provider is not a component that can be swapped on trust: a model that guesses past
 * an unlabelled control reports disabled shoppers completing purchases they cannot
 * complete, and nothing about that looks broken from here.
 */
export async function getProvider(): Promise<ReasoningProvider> {
  if (cachedProvider) return cachedProvider;

  const choice = (process.env.BUYABLE_PROVIDER ?? "gemini").toLowerCase();

  if (choice === "bedrock") {
    cachedProvider = createProvider({ region: REGION, provider: "bedrock" });
    return cachedProvider;
  }

  const secretArn = process.env.PROVIDER_SECRET_ARN ?? process.env.ANTHROPIC_SECRET_ARN;
  if (!secretArn) throw new Error("PROVIDER_SECRET_ARN is not set");

  const secrets = new SecretsManagerClient({});
  const secret = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = (secret.SecretString ?? "").trim();

  // The secret holds JSON so a future provider can be added without changing the
  // shape. A bare string is still accepted, because that is what a person pastes when
  // they are in a hurry.
  let keys: Record<string, string> = {};
  if (raw.startsWith("{")) {
    keys = JSON.parse(raw) as Record<string, string>;
  } else if (raw) {
    keys = { GEMINI_API_KEY: raw };
  }

  const apiKey = keys.GEMINI_API_KEY ?? keys.gemini;
  if (!apiKey) {
    throw new Error(
      `BUYABLE_PROVIDER is "${choice}" but the provider secret holds no key for it.`,
    );
  }

  cachedProvider = createProvider({ region: REGION, provider: choice, geminiApiKey: apiKey });
  return cachedProvider;
}

/** Runs expire, because a public scanner accumulates a lot of them and none age well. */
const RUN_TTL_DAYS = 30;

export function runTtl(): number {
  return Math.floor(Date.now() / 1000) + RUN_TTL_DAYS * 24 * 60 * 60;
}

export interface RunRecord {
  pk: string;
  sk: string;
  runId: string;
  status: "queued" | "running" | "complete" | "failed" | "refused";
  createdAt: string;
  updatedAt: string;
  journey?: unknown;
  /** Populated as personas finish, so the status endpoint can show progress. */
  progress?: Record<string, string>;
  reportUrl?: string;
  error?: string;
  /**
   * Index keys, present only on a run started by somebody signed in.
   *
   * An anonymous run carries none of these and therefore appears in no index, which
   * is the correct behaviour rather than an omission: there is nobody to list it for.
   */
  ownerKey?: string;
  journeyKey?: string;
  startedAt?: string;
  journeyLabel?: string;
  journeyGoal?: string;
  startUrl?: string;
  completionRate?: number;
  siteIsTheVariable?: boolean;
  personaSummary?: string;
  ttl: number;
}

/**
 * Create or advance a run record, setting only the fields given.
 *
 * An update rather than a put, and the distinction is load bearing.
 *
 * A run passes through four handlers as it goes: started, aggregated, finalised, or
 * failed. Each one knows about its own part of the record and nothing about the rest.
 * With a put, each of them silently deleted every field it did not happen to mention,
 * and the fields that get deleted are exactly the ones written once at the start and
 * needed at the end: who owns the run, which journey it belongs to, when it began.
 *
 * That bug had already been found once, in the report access grant, and was fixed
 * there by moving the grant to its own item so a put could not reach it. The index
 * keys cannot be moved, because a secondary index projects from this item. So the
 * write is narrowed instead: after this, a handler can only ever change what it names.
 *
 * `status` is a reserved word in DynamoDB, as is `ttl`, so every attribute goes
 * through a placeholder rather than only the ones that happen to collide today.
 */
export async function putRun(
  record: Partial<Omit<RunRecord, "pk" | "sk" | "ttl">> & { runId: string },
): Promise<void> {
  const sets: string[] = ["#ttl = :ttl"];
  const names: Record<string, string> = { "#ttl": "ttl" };
  const values: Record<string, unknown> = { ":ttl": runTtl() };

  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    sets.push(`#${key} = :${key}`);
    names[`#${key}`] = key;
    values[`:${key}`] = value;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `run#${record.runId}`, sk: "meta" },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function getRun(runId: string): Promise<RunRecord | undefined> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { pk: `run#${runId}`, sk: "meta" } }),
  );
  return result.Item as RunRecord | undefined;
}

/** Step-level events, written as they happen so the status page can stream progress. */
export async function putEvent(runId: string, seq: number, event: unknown): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `run#${runId}`,
        sk: `event#${String(seq).padStart(6, "0")}`,
        event,
        at: new Date().toISOString(),
        ttl: runTtl(),
      },
    }),
  );
}

export async function listEvents(runId: string): Promise<unknown[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": `run#${runId}`, ":prefix": "event#" },
      Limit: 500,
    }),
  );
  return (result.Items ?? []).map((i) => i.event);
}

export async function putObject(args: {
  bucket: string;
  key: string;
  body: string;
  contentType: string;
  cacheControl?: string;
}): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      CacheControl: args.cacheControl,
    }),
  );
}

export function json(status: number, body: unknown) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

/**
 * Read an object back. Reports live in the private evidence bucket and are served
 * only through the gate, so this is how the gate gets at them.
 */
export async function getObjectText(bucket: string, key: string): Promise<string | undefined> {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await result.Body?.transformToString();
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") return undefined;
    throw err;
  }
}

/**
 * The access grant for a report, kept as its own item.
 *
 * It would have been simpler to hang the key digest off the run's `meta` item. That
 * was the first version and it was wrong: `putRun` writes the whole item, three
 * different handlers call it after the run has started, and every one of them would
 * have silently deleted the grant. The report would then be unopenable by anybody,
 * including the person holding the key, and nothing would have looked broken until
 * somebody tried to read one.
 *
 * A separate sort key removes the possibility rather than relying on four call sites
 * remembering. `putRun` writes `meta` and physically cannot touch `grant`.
 *
 * Only the digest is stored. A dump of this table opens no reports at all, which is
 * the whole reason the key is not kept beside it.
 */
export interface ReportGrantRecord {
  keyHash: string;
  expiresAt: string;
  revokedAt?: string;
  readCount?: number;
  lastReadAt?: string;
}

export async function putReportGrant(
  runId: string,
  grant: { keyHash: string; expiresAt: string },
): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: `run#${runId}`, sk: "grant", ttl: runTtl(), ...grant },
    }),
  );
}

export async function getReportGrant(runId: string): Promise<ReportGrantRecord | undefined> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { pk: `run#${runId}`, sk: "grant" } }),
  );
  return result.Item as ReportGrantRecord | undefined;
}

/**
 * Note that a report was read.
 *
 * Not for its own sake. The value of an access log here is that the owner of a report
 * can see that a link they believed was private has been opened forty times from
 * somewhere they do not recognise, and then revoke it. Access control with no way to
 * notice it has failed is only half of the thing.
 *
 * Best effort: a counter that cannot be written is not a reason to keep somebody from
 * a report they hold the key to.
 */
export async function recordReportAccess(runId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: `run#${runId}`, sk: "grant" },
        UpdateExpression: "SET lastReadAt = :now ADD readCount :one",
        ExpressionAttributeValues: { ":now": new Date().toISOString(), ":one": 1 },
      }),
    );
  } catch (err) {
    console.warn("could not record report access", err);
  }
}

/**
 * Revoke a report, permanently.
 *
 * Conditional on the key digest rather than read-then-write, so a revocation cannot be
 * lost to a concurrent update and cannot land on a grant that changed underneath it.
 */
export async function revokeReport(runId: string, keyHash: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: `run#${runId}`, sk: "grant" },
        UpdateExpression: "SET revokedAt = :now",
        ConditionExpression: "keyHash = :hash",
        ExpressionAttributeValues: { ":now": new Date().toISOString(), ":hash": keyHash },
      }),
    );
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

/* --------------------------------------------------------------------------- *
 * Accounts.
 *
 * Signing in is additive. Everything works without it, and an account buys exactly
 * three things: your runs are recorded as yours, you can list them, and you can see
 * one journey's numbers over time. There is no feature behind a wall.
 * --------------------------------------------------------------------------- */

/**
 * Who is calling, when anybody is.
 *
 * The subject claim from the token API Gateway already verified. Never an email and
 * never anything the caller chose: an email is mutable and a display name is not an
 * identity, and keying ownership on either means a tenant boundary that moves when
 * somebody edits their profile.
 */
export function callerId(event: {
  requestContext?: unknown;
}): string | undefined {
  // Read structurally rather than through the aws-lambda types. Those describe the
  // payload of an API with an authorizer attached, and this same handler also serves
  // routes with none, where the field is simply absent.
  const context = event.requestContext as
    | { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }
    | undefined;
  const sub = context?.authorizer?.jwt?.claims?.sub;
  return typeof sub === "string" && sub ? sub : undefined;
}

/**
 * The partition a caller's runs live in.
 *
 * Prefixed rather than the bare subject so that an index partition can never be
 * confused with anything else that might later share the attribute, and so a value
 * read out of the table is obviously an owner rather than obviously a UUID.
 */
export function ownerKeyFor(callerId: string): string {
  return `owner#${callerId}`;
}

/** What a run needs in order to appear in either index. Absent on anonymous runs. */
export interface RunOwnership {
  ownerKey: string;
  journeyKey: string;
  startedAt: string;
  journeyLabel: string;
  journeyGoal: string;
  startUrl: string;
}

/**
 * Attach the verdict to the run record, so a history list is one query.
 *
 * The alternative is reading every run's report to draw a list, which is a page load
 * that gets slower every week for a feature whose entire purpose is looking a long
 * way back.
 */
export interface RunOutcomeSummary {
  completionRate?: number;
  siteIsTheVariable?: boolean;
  /** "baseline 1/1, assistive 0/1", denormalised for a list row. */
  personaSummary?: string;
}

/** The verdict, denormalised onto the run record so a history list is one query. */
export async function updateRunSummary(
  runId: string,
  summary: RunOutcomeSummary,
): Promise<void> {
  try {
    await putRun({ runId, ...summary });
  } catch (err) {
    // A missing list row is cosmetic. Failing a run that produced a real verdict
    // because a denormalised copy could not be written would not be.
    console.warn("could not write the run summary", err);
  }
}

export interface RunListRow {
  runId: string;
  status: string;
  startedAt: string;
  journeyKey?: string;
  journeyLabel?: string;
  journeyGoal?: string;
  startUrl?: string;
  completionRate?: number;
  siteIsTheVariable?: boolean;
  personaSummary?: string;
}

/** A caller's runs, newest first. */
export async function listRunsByOwner(ownerKey: string, limit = 50): Promise<RunListRow[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "ByOwner",
      KeyConditionExpression: "ownerKey = :owner",
      ExpressionAttributeValues: { ":owner": ownerKey },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items ?? []) as RunListRow[];
}

/**
 * One journey's runs, oldest first, because a history is read left to right.
 *
 * The owner is checked by the caller against each row rather than being part of the
 * key. The journey key already contains the owner, so a caller cannot construct
 * another tenant's key without already knowing their subject; checking anyway costs
 * nothing and means the tenant boundary does not rest on that argument holding.
 */
export async function listRunsByJourney(journeyKey: string, limit = 100): Promise<RunListRow[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "ByJourney",
      KeyConditionExpression: "journeyKey = :journey",
      ExpressionAttributeValues: { ":journey": journeyKey },
      ScanIndexForward: true,
      Limit: limit,
    }),
  );
  return (result.Items ?? []) as Array<RunListRow & { ownerKey?: string }>;
}

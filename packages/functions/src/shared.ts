/**
 * Shared plumbing for the Lambda handlers.
 *
 * Clients are created at module scope so they are reused across warm invocations,
 * and the API key is fetched once and cached for the life of the container rather
 * than on every request, because Secrets Manager charges per call and a persona run
 * makes dozens of model calls behind one secret read.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
 * BUYABLE_PROVIDER decides. When it names Bedrock no secret is read at all, which is
 * the intended shape; the Anthropic path exists because this account cannot invoke
 * Bedrock models. See docs/adr/0002.
 */
export async function getProvider(): Promise<ReasoningProvider> {
  if (cachedProvider) return cachedProvider;

  const choice = (process.env.BUYABLE_PROVIDER ?? "anthropic").toLowerCase();

  if (choice === "bedrock") {
    cachedProvider = createProvider({ region: REGION, provider: "bedrock" });
    return cachedProvider;
  }

  const secretArn = process.env.ANTHROPIC_SECRET_ARN;
  if (!secretArn) throw new Error("ANTHROPIC_SECRET_ARN is not set");

  const secrets = new SecretsManagerClient({});
  const secret = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = secret.SecretString ?? "";

  // Accept either a bare key or a JSON blob, since both are things people paste in.
  let apiKey = raw.trim();
  if (apiKey.startsWith("{")) {
    const parsed = JSON.parse(apiKey) as Record<string, string>;
    apiKey = parsed.ANTHROPIC_API_KEY ?? parsed.apiKey ?? "";
  }
  if (!apiKey) throw new Error("The Anthropic secret is present but empty");

  cachedProvider = createProvider({ region: REGION, provider: "anthropic", anthropicApiKey: apiKey });
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
  ttl: number;
}

export async function putRun(record: Omit<RunRecord, "pk" | "sk" | "ttl">): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: `run#${record.runId}`, sk: "meta", ttl: runTtl(), ...record },
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

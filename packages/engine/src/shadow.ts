/**
 * Publishing a patched build so it can actually be tested.
 *
 * The AgentCore browser runs in an AWS-managed sandbox and reaches sites over the
 * public internet, exactly as any other visitor does. There is no way to hand it a
 * local directory, so verifying a fix means putting the patched build somewhere it
 * can be fetched from. That constraint is also what keeps the verification honest:
 * the re-run hits a real URL over real HTTP, with nothing stubbed.
 */

import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime-types";

export interface PublishShadowOptions {
  region: string;
  bucket: string;
  /** CloudFront base URL in front of the shadow bucket, without a trailing slash. */
  baseUrl: string;
  /** Local directory containing the patched build. */
  directory: string;
  /** Key prefix, normally the report id, so builds never collide. */
  prefix: string;
}

export interface ShadowBuild {
  baseUrl: string;
  prefix: string;
  fileCount: number;
  /** Maps a path in the original site to its URL in the shadow build. */
  urlFor(relativePath: string): string;
}

async function filesUnder(dir: string, base = dir, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await filesUnder(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

export async function publishShadowBuild(opts: PublishShadowOptions): Promise<ShadowBuild> {
  const s3 = new S3Client({ region: opts.region });
  const files = await filesUnder(opts.directory);

  if (files.length === 0) {
    throw new Error(`Nothing to publish: ${opts.directory} is empty`);
  }

  await Promise.all(
    files.map(async (relative) => {
      const body = await readFile(path.join(opts.directory, relative));
      await s3.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: `${opts.prefix}/${relative.split(path.sep).join("/")}`,
          Body: body,
          ContentType: mime.lookup(relative) || "application/octet-stream",
          // A verification run must never read a stale object. The distribution has
          // caching disabled as well; this is the belt to that pair of braces, because
          // a cached response here would silently produce a false verdict.
          CacheControl: "no-store, max-age=0",
        }),
      );
    }),
  );

  const base = `${opts.baseUrl.replace(/\/+$/, "")}/${opts.prefix}`;
  return {
    baseUrl: base,
    prefix: opts.prefix,
    fileCount: files.length,
    urlFor: (relativePath: string) => `${base}/${relativePath.replace(/^\/+/, "")}`,
  };
}

/**
 * Rewrite a URL from the original site to the equivalent URL in a shadow build.
 *
 * The journey is defined against the original start URL, and the re-run has to begin
 * at the same page of the patched copy or it would not be the same journey.
 */
export function toShadowUrl(originalUrl: string, shadow: ShadowBuild): string {
  const url = new URL(originalUrl);
  const filename = url.pathname.replace(/^\/+/, "") || "index.html";
  return shadow.urlFor(filename + url.search);
}

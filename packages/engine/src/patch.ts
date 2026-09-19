/**
 * Turning a located blocker into a change in source.
 *
 * Three steps, each of which can refuse: find the file that renders the offending
 * element, ask for an anchored replacement, apply it to a copy. Nothing here touches
 * the working tree, and nothing here claims the fix works. That claim requires
 * re-running the journey. See ADR 0004 and ADR 0003.
 */

import { readdir, readFile, stat, mkdir, copyFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { ReasoningProvider } from "./reasoning.js";
import type { Blocker, Patch } from "./types.js";

export class PatchRefused extends Error {}

const SOURCE_EXTENSIONS = new Set([".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".js", ".ts"]);
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "cdk.out", "coverage"]);

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      await walk(full, out);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Candidate signatures to search source for, most distinctive first.
 *
 * An id is close to unique and is the best anchor available. Class names are weaker
 * but usually good enough. A fragment of the rendered outer HTML is the last resort
 * and often fails on anything that templates its markup, which is an honest limit
 * rather than something to paper over with fuzzy matching.
 */
function signaturesFor(blocker: Blocker): string[] {
  const out: string[] = [];

  const idMatch = blocker.selector?.match(/#([A-Za-z0-9_-]+)/);
  if (idMatch?.[1]) out.push(`id="${idMatch[1]}"`, `id='${idMatch[1]}'`);

  const classMatch = blocker.outerHtml?.match(/class="([^"]+)"/);
  if (classMatch?.[1]) {
    for (const cls of classMatch[1].split(/\s+/).filter(Boolean).slice(0, 3)) {
      out.push(`"${cls}"`, `'${cls}'`);
    }
  }

  if (blocker.outerHtml) {
    // The opening tag alone, with attributes, before any whitespace reflow.
    const openTag = blocker.outerHtml.match(/^<[^>]{0,200}>/)?.[0];
    if (openTag) out.push(openTag.replace(/\s+/g, " ").trim());
  }

  return out;
}

export interface SourceLocation {
  absolutePath: string;
  /** Relative to the source root, which is what a reviewer sees in a pull request. */
  relativePath: string;
  contents: string;
  /** Which signature matched, recorded so a wrong file can be diagnosed later. */
  matchedOn: string;
}

/**
 * Find the file that renders the blocking element.
 *
 * Refuses rather than guesses when a signature matches several files. Patching the
 * wrong file would produce a diff that applies cleanly, reads plausibly, and fixes
 * nothing, which is worse than reporting that we could not find it.
 */
export async function locateSource(
  sourceRoot: string,
  blocker: Blocker,
): Promise<SourceLocation> {
  const files = await walk(sourceRoot);
  if (files.length === 0) throw new PatchRefused(`No source files found under ${sourceRoot}`);

  for (const signature of signaturesFor(blocker)) {
    const hits: Array<{ file: string; contents: string }> = [];
    for (const file of files) {
      const contents = await readFile(file, "utf8");
      if (contents.includes(signature)) hits.push({ file, contents });
    }
    if (hits.length === 1) {
      const hit = hits[0]!;
      return {
        absolutePath: hit.file,
        relativePath: path.relative(sourceRoot, hit.file),
        contents: hit.contents,
        matchedOn: signature,
      };
    }
    if (hits.length > 1) {
      throw new PatchRefused(
        `Signature ${JSON.stringify(signature)} matched ${hits.length} files, so the target is ambiguous: ${hits
          .map((h) => path.relative(sourceRoot, h.file))
          .join(", ")}`,
      );
    }
  }

  throw new PatchRefused(
    `Could not find the source for this element. Tried: ${signaturesFor(blocker).map((s) => JSON.stringify(s)).join(", ")}`,
  );
}

/** A minimal unified diff, generated from the two texts rather than asserted by a model. */
export function unifiedDiff(before: string, after: string, filePath: string, context = 3): string {
  const a = before.split("\n");
  const b = after.split("\n");

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA > start && endB > start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const from = Math.max(0, start - context);
  const toA = Math.min(a.length - 1, endA + context);
  const toB = Math.min(b.length - 1, endB + context);

  const lines: string[] = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${from + 1},${toA - from + 1} +${from + 1},${toB - from + 1} @@`,
  ];

  for (let i = from; i < start; i++) lines.push(` ${a[i]}`);
  for (let i = start; i <= endA; i++) lines.push(`-${a[i]}`);
  for (let i = start; i <= endB; i++) lines.push(`+${b[i]}`);
  for (let i = endA + 1; i <= toA; i++) lines.push(` ${a[i]}`);

  return lines.join("\n");
}

export interface ProposedPatch extends Patch {
  absolutePath: string;
  before: string;
  after: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Ask for a fix and verify it is applicable, without applying it anywhere yet.
 *
 * The anchor check is the whole safety story: an anchor that appears zero times was
 * invented, and one that appears more than once is ambiguous. Both are refused.
 */
export async function proposePatch(args: {
  provider: ReasoningProvider;
  sourceRoot: string;
  blocker: Blocker;
}): Promise<ProposedPatch> {
  const location = await locateSource(args.sourceRoot, args.blocker);

  const proposal = await args.provider.proposeFix({
    blocker: args.blocker,
    filePath: location.relativePath,
    fileContents: location.contents,
  });

  if (!proposal.oldText) {
    throw new PatchRefused("The model returned no anchor text.");
  }
  if (proposal.oldText === proposal.newText) {
    throw new PatchRefused("The proposed change is a no-op.");
  }

  const occurrences = location.contents.split(proposal.oldText).length - 1;
  if (occurrences === 0) {
    throw new PatchRefused(
      `The anchor does not appear in ${location.relativePath}. The model proposed text that is not in the file.`,
    );
  }
  if (occurrences > 1) {
    throw new PatchRefused(
      `The anchor appears ${occurrences} times in ${location.relativePath}, so the change is ambiguous.`,
    );
  }

  const after = location.contents.replace(proposal.oldText, proposal.newText);

  return {
    filePath: location.relativePath,
    absolutePath: location.absolutePath,
    before: location.contents,
    after,
    diff: unifiedDiff(location.contents, after, location.relativePath),
    rationale: proposal.rationale,
    wcag: proposal.wcag.length ? proposal.wcag : args.blocker.wcag,
    blockerKind: args.blocker.kind,
    inputTokens: proposal.inputTokens,
    outputTokens: proposal.outputTokens,
  };
}

/**
 * Write a patched copy of the whole source tree to a scratch directory.
 *
 * A copy rather than an edit in place, because the working tree belongs to whoever
 * is running this and a verification run is not a good reason to modify it.
 */
export async function materialisePatchedTree(args: {
  sourceRoot: string;
  destination: string;
  patch: ProposedPatch;
}): Promise<string> {
  const { sourceRoot, destination, patch } = args;

  const copyTree = async (from: string, to: string): Promise<void> => {
    await mkdir(to, { recursive: true });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await copyTree(src, dst);
      } else {
        await copyFile(src, dst);
      }
    }
  };

  await copyTree(sourceRoot, destination);
  const target = path.join(destination, patch.filePath);
  await writeFile(target, patch.after, "utf8");

  const written = await stat(target);
  if (written.size === 0) throw new PatchRefused(`Patched file ${patch.filePath} is empty.`);

  return destination;
}

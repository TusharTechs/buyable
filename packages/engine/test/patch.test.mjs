/**
 * Tests for the patch layer.
 *
 * These cover the refusals rather than the happy path, because the refusals are the
 * safety story. A patch that applies at the wrong place produces a diff that reads
 * plausibly and fixes nothing, and that failure is much more expensive than an
 * outright refusal: the number would not move, and the obvious conclusion would be
 * that the fix was wrong rather than that it landed in the wrong file.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  locateSource,
  proposePatch,
  materialisePatchedTree,
  unifiedDiff,
  PatchRefused,
} from "../dist/patch.js";

const BROKEN_CHECKOUT = `<!doctype html>
<html lang="en">
<body>
  <main>
    <h1>Checkout</h1>
    <button class="pay-btn" id="pay">
      <svg aria-hidden="true"><rect x="2" y="5"></rect></svg>
    </button>
  </main>
</body>
</html>
`;

const OTHER_PAGE = `<!doctype html>
<html lang="en">
<body><a class="btn" href="checkout.html">Continue to checkout</a></body>
</html>
`;

async function fixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), "buyable-test-"));
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(root, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, contents, "utf8");
  }
  return root;
}

const blocker = {
  persona: "assistive",
  step: 27,
  url: "https://example.test/checkout.html",
  node: { ref: 33, role: "button", name: "", states: [], focusable: true, depth: 4 },
  selector: "#pay",
  outerHtml: '<button class="pay-btn" id="pay"><svg aria-hidden="true"></svg></button>',
  kind: "control-without-accessible-name",
  wcag: ["4.1.2", "2.4.6"],
  agentExplanation: "The button announces nothing, so I cannot tell what it does.",
};

/** A provider that returns whatever the test tells it to. */
function stubProvider(fix) {
  return {
    id: "stub",
    estimateCostUsd: () => 0,
    decide: async () => {
      throw new Error("not used");
    },
    proposeFix: async () => ({ inputTokens: 10, outputTokens: 10, wcag: ["4.1.2"], rationale: "r", ...fix }),
  };
}

describe("locateSource", () => {
  test("finds the file containing the element's id", async () => {
    const root = await fixture({ "checkout.html": BROKEN_CHECKOUT, "cart.html": OTHER_PAGE });
    const found = await locateSource(root, blocker);
    assert.equal(found.relativePath, "checkout.html");
    assert.equal(found.matchedOn, 'id="pay"');
  });

  test("refuses when the signature matches more than one file", async () => {
    const root = await fixture({
      "checkout.html": BROKEN_CHECKOUT,
      "checkout-v2.html": BROKEN_CHECKOUT,
    });
    await assert.rejects(() => locateSource(root, blocker), PatchRefused);
  });

  test("refuses when nothing matches", async () => {
    const root = await fixture({ "cart.html": OTHER_PAGE });
    await assert.rejects(() => locateSource(root, blocker), PatchRefused);
  });

  test("ignores node_modules and build output", async () => {
    const root = await fixture({
      "checkout.html": BROKEN_CHECKOUT,
      "node_modules/pkg/checkout.html": BROKEN_CHECKOUT,
      "dist/checkout.html": BROKEN_CHECKOUT,
    });
    const found = await locateSource(root, blocker);
    assert.equal(found.relativePath, "checkout.html");
  });
});

describe("proposePatch anchoring", () => {
  test("applies a unique anchor", async () => {
    const root = await fixture({ "checkout.html": BROKEN_CHECKOUT });
    const patch = await proposePatch({
      provider: stubProvider({
        oldText: '<button class="pay-btn" id="pay">',
        newText: '<button class="pay-btn" id="pay" aria-label="Complete purchase">',
      }),
      sourceRoot: root,
      blocker,
    });
    assert.match(patch.after, /aria-label="Complete purchase"/);
    assert.match(patch.diff, /^\+.*aria-label/m);
    assert.equal(patch.filePath, "checkout.html");
  });

  test("refuses an anchor that is not in the file", async () => {
    const root = await fixture({ "checkout.html": BROKEN_CHECKOUT });
    await assert.rejects(
      () =>
        proposePatch({
          provider: stubProvider({ oldText: '<button id="checkout">', newText: "x" }),
          sourceRoot: root,
          blocker,
        }),
      (err) => err instanceof PatchRefused && /does not appear/.test(err.message),
    );
  });

  test("refuses an ambiguous anchor", async () => {
    const root = await fixture({
      "checkout.html": BROKEN_CHECKOUT.replace("</main>", "<svg aria-hidden=\"true\"></svg></main>"),
    });
    await assert.rejects(
      () =>
        proposePatch({
          provider: stubProvider({ oldText: '<svg aria-hidden="true">', newText: "<svg>" }),
          sourceRoot: root,
          blocker,
        }),
      (err) => err instanceof PatchRefused && /appears 2 times/.test(err.message),
    );
  });

  test("refuses a no-op", async () => {
    const root = await fixture({ "checkout.html": BROKEN_CHECKOUT });
    await assert.rejects(
      () =>
        proposePatch({
          provider: stubProvider({ oldText: '<h1>Checkout</h1>', newText: '<h1>Checkout</h1>' }),
          sourceRoot: root,
          blocker,
        }),
      (err) => err instanceof PatchRefused && /no-op/.test(err.message),
    );
  });
});

describe("materialisePatchedTree", () => {
  test("writes a patched copy and leaves the original untouched", async () => {
    const root = await fixture({ "checkout.html": BROKEN_CHECKOUT, "cart.html": OTHER_PAGE });
    const patch = await proposePatch({
      provider: stubProvider({
        oldText: '<button class="pay-btn" id="pay">',
        newText: '<button class="pay-btn" id="pay" aria-label="Complete purchase">',
      }),
      sourceRoot: root,
      blocker,
    });

    const destination = await mkdtemp(path.join(tmpdir(), "buyable-out-"));
    await materialisePatchedTree({ sourceRoot: root, destination, patch });

    const patched = await readFile(path.join(destination, "checkout.html"), "utf8");
    assert.match(patched, /aria-label="Complete purchase"/);

    // Sibling files come along, or the shadow build would 404 mid-journey.
    const sibling = await readFile(path.join(destination, "cart.html"), "utf8");
    assert.equal(sibling, OTHER_PAGE);

    const original = await readFile(path.join(root, "checkout.html"), "utf8");
    assert.equal(original, BROKEN_CHECKOUT, "the working tree must not be modified");
  });
});

describe("unifiedDiff", () => {
  test("marks the changed line and keeps surrounding context", () => {
    const before = "a\nb\nc\nd\ne\n";
    const after = "a\nb\nCHANGED\nd\ne\n";
    const diff = unifiedDiff(before, after, "f.txt");
    assert.match(diff, /^--- a\/f\.txt$/m);
    assert.match(diff, /^-c$/m);
    assert.match(diff, /^\+CHANGED$/m);
    assert.match(diff, /^ b$/m);
  });

  test("is derived from the texts rather than asserted", () => {
    const diff = unifiedDiff("x\n", "y\n", "f.txt");
    assert.match(diff, /^-x$/m);
    assert.match(diff, /^\+y$/m);
  });
});

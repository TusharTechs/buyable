/**
 * Loop detection, tested against a real browser with no model in the loop.
 *
 * The provider here is a stub that always returns the same useless action, which is
 * precisely the failure this test exists for. Pointed at a real single page
 * storefront, the baseline persona clicked one element fourteen times with near
 * identical reasoning and the harness noticed none of it: no signal to the model, no
 * abort, and a verdict that would have been published as a site failure. The run only
 * ended because an upstream API quota cut it off.
 *
 * Using a stub rather than a model is deliberate. A model might, on a given day,
 * break out of the loop by itself, and a test that sometimes passes for reasons
 * outside the code under test is worse than no test. This one is deterministic.
 *
 * It does use a real AgentCore browser session, costing roughly half a cent and no
 * model tokens, because the thing being tested is whether we can tell that a real
 * page did not change.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { runPersona } from "../dist/runPersona.js";
import { defineJourney } from "../dist/runJourney.js";

const REGION = process.env.AWS_REGION ?? "us-west-2";
const FIXTURE = "https://d2dvlfc6rcbvw8.cloudfront.net/index.html";

/** Always returns the same action, which changes nothing on the page. */
function stuckProvider(action) {
  let calls = 0;
  const provider = {
    id: "stub:stuck",
    estimateCostUsd: () => 0,
    decide: async () => {
      calls++;
      return {
        action: { ...action, reason: "A stub that never adapts." },
        inputTokens: 0,
        outputTokens: 0,
        narration: "",
      };
    },
    proposeFix: async () => {
      throw new Error("not used");
    },
  };
  Object.defineProperty(provider, "calls", { get: () => calls });
  return provider;
}

const journey = defineJourney({
  name: "Loop detection probe",
  startUrl: FIXTURE,
  goal: "This journey is never meant to complete.",
  assertion: { textPresent: "a string that appears nowhere on this site" },
});

describe("a persona that stops making progress", () => {
  test(
    "is abandoned rather than allowed to spend money forever",
    { timeout: 300_000 },
    async () => {
      // Escape on a static page: a legal action, dispatched successfully, that
      // changes nothing. Exactly the shape of the real failure.
      const provider = stuckProvider({ action: "press", key: "Escape" });

      const result = await runPersona({
        region: REGION,
        journey,
        persona: "assistive",
        runLabel: "looptest",
        provider,
      });

      assert.equal(
        result.outcome,
        "inconclusive",
        `expected inconclusive, got ${result.outcome}: ${result.errorMessage ?? ""}`,
      );
      assert.equal(result.completed, false);

      // The persona is allowed 34 steps. Catching this at six or fewer is the whole
      // point: fourteen identical clicks should never have been reachable.
      assert.ok(
        result.steps.length <= 6,
        `stopped after ${result.steps.length} steps, which is too slow to notice`,
      );

      assert.match(result.errorMessage ?? "", /says nothing about the site/i);
    },
  );

  test(
    "is excluded from the verdict rather than counted against the site",
    { timeout: 300_000 },
    async () => {
      const { summariseRuns } = await import("../dist/runJourney.js");
      const provider = stuckProvider({ action: "press", key: "Escape" });

      const stuck = await runPersona({
        region: REGION,
        journey,
        persona: "assistive",
        runLabel: "looptest2",
        provider,
      });

      const report = summariseRuns({
        journey,
        reportId: "loop-test",
        runsByPersona: { assistive: [stuck] },
      });

      const verdict = report.verdicts.assistive;
      // Zero usable attempts, not one failed attempt. The difference matters: one
      // says we learned nothing, the other accuses a site of excluding people.
      assert.equal(verdict.attempts, 0, "a stuck run must not land in the denominator");
      assert.equal(verdict.completions, 0);
      assert.equal(verdict.inconclusive, 1);
    },
  );
});

describe("the page fingerprint", () => {
  test("treats a focus move as progress", async () => {
    const { pageFingerprint } = await import("../dist/page.js");
    const node = (ref, role, name) => ({ ref, role, name, states: [], focusable: true, depth: 1 });
    const nodes = [node(0, "link", "Shop"), node(1, "link", "Basket")];

    const onFirst = { nodes, focusedRef: 0, backendByRef: new Map(), tabOrder: [0, 1] };
    const onSecond = { nodes, focusedRef: 1, backendByRef: new Map(), tabOrder: [0, 1] };

    // Tab is how a keyboard user gets anywhere. Treating it as no progress abandoned
    // healthy runs after four consecutive tabs.
    assert.notEqual(
      pageFingerprint("https://x.test/", onFirst),
      pageFingerprint("https://x.test/", onSecond),
      "moving focus must count as progress",
    );
  });

  test("distinguishes a changed accessibility tree from an unchanged one", async () => {
    const { pageFingerprint } = await import("../dist/page.js");

    const node = (ref, role, name) => ({
      ref,
      role,
      name,
      states: [],
      focusable: true,
      depth: 1,
    });

    const a = { nodes: [node(0, "button", "Pay")], focusedRef: 0, backendByRef: new Map(), tabOrder: [0] };
    const b = { nodes: [node(0, "button", "Pay")], focusedRef: 0, backendByRef: new Map(), tabOrder: [0] };
    const c = { nodes: [node(0, "button", "")], focusedRef: 0, backendByRef: new Map(), tabOrder: [0] };

    assert.equal(pageFingerprint("https://x.test/", a), pageFingerprint("https://x.test/", b));
    assert.notEqual(pageFingerprint("https://x.test/", a), pageFingerprint("https://x.test/", c));

    // A single page application changes content without changing the URL, so the URL
    // alone must never be the signal.
    assert.notEqual(pageFingerprint("https://x.test/", a), pageFingerprint("https://x.test/", c));
  });
});

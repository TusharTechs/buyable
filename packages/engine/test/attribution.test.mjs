/**
 * What a report is allowed to claim.
 *
 * Every test here exists because a version of this code once made a claim it could
 * not support, and one of them very nearly went out against a real retailer. The
 * recurring mistake has a single shape: treating an absence of evidence as evidence
 * of a problem, and the site is always the one that pays for it.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { summariseRuns, defineJourney } from "../dist/runJourney.js";

const journey = defineJourney({
  name: "attribution",
  startUrl: "https://example.test/",
  goal: "irrelevant",
  assertion: { textPresent: "done" },
});

/** A run result with only the fields the summary reads. */
function run(outcome, completed, extra = {}) {
  return {
    persona: "assistive",
    outcome,
    completed,
    steps: [],
    startedAt: new Date().toISOString(),
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    blindActivations: [],
    ...extra,
  };
}

describe("a persona with no usable attempts", () => {
  const report = summariseRuns({
    journey,
    reportId: "t1",
    runsByPersona: {
      baseline: [run("completed", true)],
      // Every attempt excluded: Buyable could not drive the page.
      assistive: [run("inconclusive", false), run("error", false)],
    },
  });

  test("is not counted as having failed", () => {
    assert.equal(report.verdicts.assistive.attempts, 0);
    assert.equal(report.verdicts.assistive.inconclusive, 2);
  });

  test("does not make the site the variable", () => {
    // The whole point. A run that learned nothing about a site must not accuse it.
    assert.equal(
      report.siteIsTheVariable,
      false,
      "a persona with zero usable attempts must not be read as never completing",
    );
  });

  test("does not drag the headline rate down", () => {
    // Averaging a phantom zero produced 50% on a journey that measured one persona.
    assert.equal(report.journeyCompletionRate, 1);
  });
});

describe("a persona that genuinely never completed", () => {
  const report = summariseRuns({
    journey,
    reportId: "t2",
    runsByPersona: {
      baseline: [run("completed", true)],
      assistive: [run("blocked", false), run("blocked", false)],
    },
  });

  test("does make the site the variable", () => {
    assert.equal(report.verdicts.assistive.attempts, 2);
    assert.equal(report.siteIsTheVariable, true);
  });

  test("and lowers the headline rate", () => {
    assert.equal(report.journeyCompletionRate, 0.5);
  });
});

describe("a control that never ran", () => {
  test("means no claim is made at all", () => {
    const report = summariseRuns({
      journey,
      reportId: "t3",
      runsByPersona: {
        baseline: [run("error", false)],
        assistive: [run("blocked", false)],
      },
    });
    // Without a working control, a constrained persona's failure could be the model,
    // the network or the site, and there is no way to tell which.
    assert.equal(report.siteIsTheVariable, false);
  });
});

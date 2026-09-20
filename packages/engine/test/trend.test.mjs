/**
 * What changed since last time.
 *
 * This is where the product says "your checkout worked on the 12th and does not work
 * now", which is both the most valuable thing it can say and the easiest place to say
 * something untrue. Every test here is one way of being wrong about that.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { describeTrend, isMeasured } from "../dist/trend.js";

const run = (startedAt, completionRate, status = "complete") => ({
  startedAt,
  completionRate,
  status,
});

describe("what counts as a data point", () => {
  test("a finished run with a rate does", () => {
    assert.equal(isMeasured(run("2026-09-01T00:00:00Z", 1)), true);
  });

  test("a failed, refused or unfinished run does not", () => {
    // Treating these as zero turns our own infrastructure failures into somebody
    // else's regression, complete with a chart.
    assert.equal(isMeasured(run("2026-09-01T00:00:00Z", undefined, "failed")), false);
    assert.equal(isMeasured(run("2026-09-01T00:00:00Z", undefined, "refused")), false);
    assert.equal(isMeasured(run("2026-09-01T00:00:00Z", 1, "running")), false);
  });

  test("a rate of zero is a real measurement, not a missing one", () => {
    // The opposite mistake: a journey nobody can complete measured zero, and dropping
    // it would erase the very failure the history exists to surface.
    assert.equal(isMeasured(run("2026-09-01T00:00:00Z", 0)), true);
  });
});

describe("the trend", () => {
  test("says nothing when nothing has been measured", () => {
    const trend = describeTrend([run("2026-09-01T00:00:00Z", undefined, "failed")]);
    assert.equal(trend.direction, "unknown");
    assert.equal(trend.measured, 0);
  });

  test("refuses to call one point a trend", () => {
    const trend = describeTrend([run("2026-09-01T00:00:00Z", 1)]);
    assert.equal(trend.direction, "unknown");
    assert.equal(trend.measured, 1);
    assert.match(trend.message, /measured once/);
    assert.equal(trend.to.rate, 1);
    assert.equal(trend.from, undefined);
  });

  test("reports a regression, with both dates and both numbers", () => {
    const trend = describeTrend([run("2026-09-01T00:00:00Z", 1), run("2026-09-20T00:00:00Z", 0)]);
    assert.equal(trend.direction, "regressed");
    assert.match(trend.message, /100 percent .* 2026-09-01/);
    assert.match(trend.message, /0 percent .* 2026-09-20/);
  });

  test("reports a fix", () => {
    const trend = describeTrend([run("2026-09-01T00:00:00Z", 0), run("2026-09-20T00:00:00Z", 1)]);
    assert.equal(trend.direction, "fixed");
  });

  test("reports no change without inventing one", () => {
    const trend = describeTrend([run("2026-09-01T00:00:00Z", 0.5), run("2026-09-20T00:00:00Z", 0.5)]);
    assert.equal(trend.direction, "unchanged");
  });

  test("compares the last two measured runs, skipping the ones in between that failed", () => {
    // The failure case that matters: a run that fell over sits between two good ones.
    // Comparing against it would report a regression and then a fix, neither of which
    // happened to the site.
    const trend = describeTrend([
      run("2026-09-01T00:00:00Z", 1),
      run("2026-09-10T00:00:00Z", undefined, "failed"),
      run("2026-09-20T00:00:00Z", 1),
    ]);
    assert.equal(trend.direction, "unchanged");
    assert.equal(trend.measured, 2);
    assert.equal(trend.from.at, "2026-09-01T00:00:00Z");
  });

  test("compares the two most recent, not the first and the last", () => {
    // A journey that broke and was fixed is not a regression, and a reader asking
    // "is it broken now" is badly served by an answer about March.
    const trend = describeTrend([
      run("2026-09-01T00:00:00Z", 1),
      run("2026-09-10T00:00:00Z", 0),
      run("2026-09-20T00:00:00Z", 0),
    ]);
    assert.equal(trend.direction, "unchanged");
    assert.equal(trend.from.at, "2026-09-10T00:00:00Z");
  });

  test("counts how many runs carried a verdict, so the claim can be weighed", () => {
    const trend = describeTrend([
      run("2026-09-01T00:00:00Z", 1),
      run("2026-09-05T00:00:00Z", undefined, "failed"),
      run("2026-09-10T00:00:00Z", 1),
      run("2026-09-20T00:00:00Z", 0),
    ]);
    assert.equal(trend.measured, 3);
    assert.equal(trend.direction, "regressed");
  });
});

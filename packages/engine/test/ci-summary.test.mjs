/**
 * What the pull request check writes.
 *
 * For a development team this markdown is the product: it is the only part of
 * Buyable they will look at most days. It is generated from a report produced by a
 * real run, held in docs/evidence, so these tests break if the shape of a report
 * changes rather than passing against a hand written stub that cannot.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { __testing } from "../dist/ci.js";

const { renderFailureSummary, renderPassSummary, renderVerdictTable, firstChangedLine } = __testing;

const report = JSON.parse(readFileSync(new URL("../../../docs/evidence/canonical-report.json", import.meta.url))).report;
const personas = ["baseline", "assistive"];
const blocked = report.verdicts.assistive;

describe("the failure summary", () => {
  const md = renderFailureSummary(report, personas, blocked, report.journey.startUrl);

  test("separates blocks with blank lines", () => {
    // The first version filtered out every empty string to drop optional lines, and
    // took the paragraph breaks with them. Everything rendered as one block.
    assert.match(md, /\n\n## |^## /);
    assert.ok(
      md.includes("\n\n| Persona |"),
      "the table needs a blank line before it or GitHub renders it as prose",
    );
    assert.ok(md.includes("\n\n### What stopped it\n\n"));
  });

  test("names the persona in a sentence rather than as a label", () => {
    assert.ok(
      md.includes("and the screen reader user did not"),
      "a title cased label mid-sentence reads as a stray proper noun",
    );
  });

  test("carries the element, the criteria and the persona's own words", () => {
    assert.ok(md.includes("#pay"));
    assert.ok(md.includes("4.1.2"));
    assert.ok(md.includes("> "), "the explanation is quoted verbatim");
  });

  test("includes what was heard at each step", () => {
    assert.ok(md.includes("heard:"), "the transcript is the evidence for the finding");
  });
});

describe("the verdict table", () => {
  test("never prints a rate for a persona with no usable attempts", () => {
    // A persona that never produced a usable attempt has no rate. Printing "0 of 0"
    // as a failure is the phantom zero that once accused Etsy of excluding people.
    const empty = {
      ...report,
      verdicts: {
        ...report.verdicts,
        assistive: { ...report.verdicts.assistive, attempts: 0, completions: 0, rate: 0 },
      },
    };
    const table = renderVerdictTable(empty, personas);
    assert.ok(table.includes("no usable attempts"));
    assert.ok(!table.includes("0 of 0"));
  });
});

describe("the pass summary", () => {
  test("states the rate and refuses to claim conformance", () => {
    const md = renderPassSummary(report, personas, report.journey.startUrl);
    assert.ok(md.includes("Journey Completion Rate"));
    assert.ok(
      md.includes("does not claim conformance"),
      "a green check must not be readable as an accessibility audit",
    );
  });
});

describe("the annotation line", () => {
  test("points at the line that changed, not the top of the file", () => {
    const before = "a\nb\nc\nd";
    const after = "a\nb\nC\nd";
    assert.equal(firstChangedLine(before, after), 3);
  });

  test("falls back to the first line rather than throwing on identical input", () => {
    assert.equal(firstChangedLine("a\nb", "a\nb"), 1);
  });
});

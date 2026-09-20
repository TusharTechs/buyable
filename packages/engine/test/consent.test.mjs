/**
 * Consent label matching, pinned against labels observed on real sites.
 *
 * Every string here was read off a live retailer or public service, because the first
 * version of these patterns was written from imagination and missed most of them. It
 * demanded "reject all" and sailed straight past GOV.UK's "Reject additional
 * cookies", which is the same phrase with one word inserted.
 *
 * The negative cases matter more than the positive ones. "Allow recommended cookies
 * only" is not a decline: it consents to recommended cookies. Treating it as the
 * closest available option would mean agreeing on behalf of a person who does not
 * exist, which is exactly what this tool should never do.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { __testing } from "../dist/consent.js";

const { isDecline, isAccept, isDismiss } = __testing;

describe("labels that decline", () => {
  const observed = [
    "Reject all",
    "Reject all cookies",          // Marks and Spencer, OneTrust
    "Reject additional cookies",   // GOV.UK
    "Decline all",
    "Decline optional cookies",
    "Refuse all cookies",
    "Only necessary",
    "Necessary cookies only",
    "Use necessary cookies only",
    "Strictly necessary only",
    "Essential cookies only",
    "Continue without accepting",
  ];
  for (const label of observed) {
    test(`"${label}"`, () => assert.equal(isDecline(label), true));
  }
});

describe("labels that are not a decline, whatever they look like", () => {
  const notDeclines = [
    // The important one. This consents to recommended cookies, so taking it because
    // nothing better was offered would still be consenting.
    ["Allow recommended cookies only", "Currys, OneTrust"],
    ["Allow all", "accepts everything"],
    ["Accept all cookies", "accepts everything"],
    ["Manage cookies", "opens another dialog, decides nothing"],
    ["Data preferences", "opens another dialog"],
    ["Privacy Notice", "a link to a document"],
    ["View cookies", "a link to a document"],
  ];
  for (const [label, why] of notDeclines) {
    test(`"${label}" (${why})`, () => assert.equal(isDecline(label), false));
  }
});

describe("labels that accept", () => {
  for (const label of ["Accept all", "Accept all cookies", "Allow all", "I agree", "Got it"]) {
    test(`"${label}"`, () => assert.equal(isAccept(label), true));
  }
  test('"Reject all cookies" is never read as accepting', () => {
    assert.equal(isAccept("Reject all cookies"), false);
  });
});

describe("labels that merely close", () => {
  for (const label of ["Close", "Dismiss", "No thanks", "×"]) {
    test(`"${label}"`, () => assert.equal(isDismiss(label), true));
  }
});

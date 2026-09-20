/**
 * What counts as the same journey.
 *
 * Every test here protects one claim: that two points on a history chart were
 * measuring the same thing. The failure mode is quiet and bad in both directions. Fold
 * two different journeys together and the chart averages unrelated numbers. Fork one
 * journey in two and the regression you were watching for silently stops being
 * watched.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { journeyKey, describeJourney } from "../dist/journeyKey.js";

const base = {
  startUrl: "https://shop.example.com/checkout",
  goal: "Add a product to the basket and reach the checkout page",
  assertion: { textPresent: "Order summary" },
};
const owner = "user-1";

describe("what does not change the identity", () => {
  test("a trailing slash", () => {
    assert.equal(
      journeyKey({ ...base, startUrl: "https://shop.example.com/checkout/" }, owner),
      journeyKey(base, owner),
    );
  });

  test("host casing", () => {
    assert.equal(
      journeyKey({ ...base, startUrl: "https://SHOP.Example.com/checkout" }, owner),
      journeyKey(base, owner),
    );
  });

  test("a fragment, which the server never sees", () => {
    assert.equal(
      journeyKey({ ...base, startUrl: "https://shop.example.com/checkout#basket" }, owner),
      journeyKey(base, owner),
    );
  });

  test("query parameter order", () => {
    const a = journeyKey({ ...base, startUrl: "https://s.example.com/x?b=2&a=1" }, owner);
    const b = journeyKey({ ...base, startUrl: "https://s.example.com/x?a=1&b=2" }, owner);
    assert.equal(a, b);
  });

  test("whitespace and case in the goal", () => {
    assert.equal(
      journeyKey({ ...base, goal: "  Add a PRODUCT to the basket   and reach the checkout page " }, owner),
      journeyKey(base, owner),
    );
  });
});

describe("what does change the identity", () => {
  test("a different query string is a different page", () => {
    // ?q=desk+lamp and ?q=sofa are not the same journey, and averaging them would
    // produce a number describing nothing.
    const a = journeyKey({ ...base, startUrl: "https://s.example.com/search?q=desk+lamp" }, owner);
    const b = journeyKey({ ...base, startUrl: "https://s.example.com/search?q=sofa" }, owner);
    assert.notEqual(a, b);
  });

  test("a different goal", () => {
    assert.notEqual(journeyKey({ ...base, goal: "Buy a sofa" }, owner), journeyKey(base, owner));
  });

  test("a different assertion, because the proof is part of the measurement", () => {
    // Change how completion is proven and the numbers stop being comparable. A new
    // history is the correct answer, however inconvenient.
    assert.notEqual(
      journeyKey({ ...base, assertion: { textPresent: "Thank you" } }, owner),
      journeyKey(base, owner),
    );
    assert.notEqual(
      journeyKey({ ...base, assertion: { urlMatches: "/confirmed" } }, owner),
      journeyKey(base, owner),
    );
  });

  test("a different owner, so two customers never share a history", () => {
    assert.notEqual(journeyKey(base, "user-1"), journeyKey(base, "user-2"));
  });

  test("a path that differs only where a field boundary is", () => {
    // Without a separator that cannot occur in the parts, a goal ending where the
    // next field begins could join into an identical string and collide two journeys.
    const a = journeyKey({ startUrl: "https://e.test/a", goal: "bc", assertion: { textPresent: "d" } }, owner);
    const b = journeyKey({ startUrl: "https://e.test/ab", goal: "c", assertion: { textPresent: "d" } }, owner);
    assert.notEqual(a, b);
  });
});

describe("stability", () => {
  test("is the same across calls, which is what a history depends on", () => {
    assert.equal(journeyKey(base, owner), journeyKey(base, owner));
  });

  test("survives a URL that will not parse", () => {
    const key = journeyKey({ ...base, startUrl: "not a url" }, owner);
    assert.match(key, /^[0-9a-f]{32}$/);
  });

  test("is a fixed length hex string, safe in a URL path", () => {
    assert.match(journeyKey(base, owner), /^[0-9a-f]{32}$/);
  });
});

describe("the label", () => {
  test("is readable and drops the noise", () => {
    assert.equal(describeJourney({ startUrl: "https://www.shop.example.com/checkout", goal: "x" }), "shop.example.com/checkout");
    assert.equal(describeJourney({ startUrl: "https://shop.example.com/", goal: "x" }), "shop.example.com");
  });
});

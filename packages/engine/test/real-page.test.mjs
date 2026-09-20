/**
 * Were we served the page that was asked for?
 *
 * This exists because of a real result. Pointed at a URL that no longer existed, the
 * free inspection reported "0 blocking, 8 impairing" for a named retailer, and every
 * one of those findings belonged to their 404 template. It would have gone into a
 * document with their name on it.
 *
 * It is the same mistake the journey runner spent a day learning not to make, in the
 * one part of the system that had never been checked for it: describing something
 * that is not the site, as though it were the site.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkWeGotTheRealPage } from "../dist/inspect.js";

describe("pages that are not the page", () => {
  test("catches a 404 that is rich enough to look like a real page", () => {
    // The case that started this. 54 reachable controls, so any check based on "is
    // the page nearly empty" would wave it straight through, as ours did.
    const result = checkWeGotTheRealPage("404 Not Found - Decathlon", "https://www.decathlon.com/x", 54);
    assert.equal(result?.kind, "error-page");
    assert.match(result.reason, /404/);
  });

  test("catches maintenance, which is neither an error nor a block", () => {
    assert.equal(checkWeGotTheRealPage("Site Maintenance", "https://www.myntra.com/x", 1)?.kind, "error-page");
  });

  test("catches an anti-bot refusal", () => {
    assert.equal(checkWeGotTheRealPage("Access Denied", "https://www.sephora.com/x", 1)?.kind, "bot-protection");
    assert.equal(checkWeGotTheRealPage("Just a moment...", "https://e.test/x", 2)?.kind, "bot-protection");
    assert.equal(checkWeGotTheRealPage("Verify you are human", "https://e.test/x", 300)?.kind, "bot-protection");
  });

  test("catches a title that is only the hostname with nothing reachable", () => {
    const result = checkWeGotTheRealPage("www.uniqlo.com", "https://www.uniqlo.com/us/en/men", 1);
    assert.equal(result?.kind, "bot-protection");
  });

  test("catches an interstitial", () => {
    assert.equal(checkWeGotTheRealPage("Choose your country", "https://e.test/", 3)?.kind, "interstitial");
  });
});

describe("pages that are the page", () => {
  test("a real listing passes", () => {
    assert.equal(
      checkWeGotTheRealPage("Men's Shoes & Sneakers. Nike.com", "https://www.nike.com/w/mens-shoes", 313),
      undefined,
    );
  });

  test("a hostname title on a page that clearly works is not bot protection", () => {
    // Plenty of sites title their home page with their own domain. With 120 controls
    // reachable, nobody is being refused entry.
    assert.equal(checkWeGotTheRealPage("www.example.com", "https://www.example.com/", 120), undefined);
  });

  test("a product whose name contains a flagged word is not an error page", () => {
    // "Error" and numbers appear in real product names. The patterns are anchored on
    // word boundaries so a shop selling a camera called the 500 is not condemned.
    assert.equal(checkWeGotTheRealPage("Canon EOS 500D camera | Shop", "https://e.test/p", 90), undefined);
    assert.equal(checkWeGotTheRealPage("Trial and Error, the box set", "https://e.test/p", 90), undefined);
  });

  test("an unparseable URL is not treated as evidence of anything", () => {
    assert.equal(checkWeGotTheRealPage("A perfectly good page", "not a url", 90), undefined);
  });
});

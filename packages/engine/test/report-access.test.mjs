/**
 * Who can read a report.
 *
 * A report says how somebody's checkout excludes their customers. Getting this wrong
 * does not look broken from the inside: every test here passes just as happily against
 * a version that lets everybody in, unless the test is written to catch that
 * specifically. So each one names the failure it exists to prevent.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  decideAccess,
  describeRefusal,
  hashReportKey,
  mintReportKey,
  reportKeyMatches,
  reportSecurityHeaders,
} from "../dist/reportAccess.js";

describe("minting", () => {
  test("never returns the same key twice", () => {
    const keys = new Set(Array.from({ length: 200 }, () => mintReportKey().key));
    assert.equal(keys.size, 200);
  });

  test("produces a key long enough not to be guessed", () => {
    // 32 bytes. Anything shorter and the whole argument for a capability URL fails.
    const { key } = mintReportKey();
    assert.ok(Buffer.from(key, "base64url").length >= 32, `got ${key.length} characters`);
  });

  test("is URL and header safe", () => {
    for (let i = 0; i < 50; i++) {
      assert.match(mintReportKey().key, /^[A-Za-z0-9_-]+$/);
    }
  });

  test("returns a hash that is not the key", () => {
    const { key, hash } = mintReportKey();
    assert.notEqual(hash, key);
    assert.ok(!hash.includes(key));
    assert.equal(hash, hashReportKey(key));
  });
});

describe("matching", () => {
  test("accepts the right key", () => {
    const { key, hash } = mintReportKey();
    assert.equal(reportKeyMatches(key, hash), true);
  });

  test("rejects a wrong key, a truncated key and an extended one", () => {
    const { key, hash } = mintReportKey();
    assert.equal(reportKeyMatches(mintReportKey().key, hash), false);
    assert.equal(reportKeyMatches(key.slice(0, -1), hash), false);
    assert.equal(reportKeyMatches(`${key}x`, hash), false);
  });

  test("rejects empty input rather than treating it as a match", () => {
    const { hash } = mintReportKey();
    assert.equal(reportKeyMatches("", hash), false);
    assert.equal(reportKeyMatches("anything", ""), false);
    assert.equal(reportKeyMatches("", ""), false);
  });
});

describe("the decision", () => {
  const grant = () => {
    const { key, hash, expiresAt } = mintReportKey();
    return { key, grant: { keyHash: hash, expiresAt } };
  };

  test("allows the holder of the key", () => {
    const { key, grant: g } = grant();
    assert.deepEqual(decideAccess(g, key), { allowed: true });
  });

  test("refuses when no grant was ever recorded", () => {
    // Failing open on a missing field is how access control quietly stops existing
    // after a schema change nobody noticed. It must refuse, not allow.
    assert.deepEqual(decideAccess(undefined, "anything"), { allowed: false, reason: "not-found" });
    assert.deepEqual(decideAccess({}, "anything"), { allowed: false, reason: "not-found" });
    assert.deepEqual(decideAccess({ expiresAt: "2099-01-01T00:00:00Z" }, "anything"), {
      allowed: false,
      reason: "not-found",
    });
  });

  test("refuses a missing key", () => {
    const { grant: g } = grant();
    assert.equal(decideAccess(g, undefined).allowed, false);
    assert.equal(decideAccess(g, "").allowed, false);
  });

  test("refuses a revoked report even with the correct key", () => {
    // Revoking is what someone reaches for when they know the link has escaped. If
    // the escaped key still worked, revoking would be theatre.
    const { key, grant: g } = grant();
    const revoked = { ...g, revokedAt: new Date().toISOString() };
    assert.deepEqual(decideAccess(revoked, key), { allowed: false, reason: "revoked" });
  });

  test("refuses an expired report", () => {
    const { key, grant: g } = grant();
    const expired = { ...g, expiresAt: new Date(Date.now() - 1000).toISOString() };
    assert.deepEqual(decideAccess(expired, key), { allowed: false, reason: "expired" });
  });

  test("treats the expiry instant itself as expired", () => {
    const { key, grant: g } = grant();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const atExpiry = { ...g, expiresAt: now.toISOString() };
    assert.equal(decideAccess(atExpiry, key, now).allowed, false);
  });

  test("checks the key before revocation and expiry", () => {
    // Otherwise the endpoint answers "this one is revoked" to anybody at all, which
    // confirms that the run id is real and that there was something worth reading.
    const { grant: g } = grant();
    const dead = {
      ...g,
      revokedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    assert.deepEqual(decideAccess(dead, "not-the-key"), { allowed: false, reason: "wrong-key" });
  });
});

describe("what a refusal says", () => {
  test("does not distinguish a wrong key from a report that does not exist", () => {
    // Distinguishing them turns the endpoint into an oracle for which run ids are real.
    const wrong = describeRefusal("wrong-key");
    const missing = describeRefusal("not-found");
    assert.equal(wrong.status, 404);
    assert.deepEqual(wrong, missing);
  });

  test("is explicit about revocation and expiry", () => {
    // By then the key has already been shown to be correct, so there is nothing left
    // to protect and a great deal to explain.
    assert.equal(describeRefusal("revoked").status, 410);
    assert.match(describeRefusal("revoked").message, /revoked/i);
    assert.equal(describeRefusal("expired").status, 410);
    assert.match(describeRefusal("expired").message, /expired/i);
  });

  test("asks for the key rather than denying the report exists", () => {
    assert.equal(describeRefusal("no-key").status, 401);
  });
});

describe("the response headers", () => {
  const headers = reportSecurityHeaders();

  test("keeps the report out of search indexes", () => {
    // A key is worth nothing if the document it protects is in a search index.
    assert.match(headers["x-robots-tag"], /noindex/);
    assert.match(headers["x-robots-tag"], /noarchive/);
  });

  test("forbids caching anywhere", () => {
    // A cached copy outlives the revocation that was meant to end it.
    assert.match(headers["cache-control"], /no-store/);
    assert.match(headers["cache-control"], /private/);
  });

  test("does not leak the report address to the site under test", () => {
    assert.equal(headers["referrer-policy"], "no-referrer");
  });
});

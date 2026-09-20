/**
 * Who is allowed to read a report.
 *
 * A Buyable report is a document describing how somebody's checkout excludes their
 * customers. It names the element, quotes the barrier, and dates it. That is exactly
 * the sort of document a competitor, a journalist or a plaintiff's lawyer would like a
 * copy of, and until now every one of them was world readable at its URL forever.
 *
 * The old argument was that the run id is a UUID, so the address is unguessable. That
 * is true and it is not enough. An unguessable address still ends up in browser
 * history, in a Referer header, in a chat message that renders a preview, in a support
 * ticket, and in the access logs of everything it passes through. Once it has leaked
 * there is no way to take it back, no way to see that it happened, and no expiry.
 *
 * So the address stops being the credential. Every report gets a key:
 *
 *  - 32 random bytes, which is not something anybody is going to guess,
 *  - shown exactly once, when the run is created,
 *  - stored only as a SHA-256 digest, so a dump of our own database does not open a
 *    single report,
 *  - compared in constant time, because a comparison that returns early leaks the
 *    answer one byte at a time,
 *  - expiring by default, and revocable immediately and permanently.
 *
 * Everything in this file is pure so that the rules can be tested without AWS in the
 * way. The storage and the HTTP live in the Lambda.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** How long a report link works for unless someone says otherwise. */
export const DEFAULT_REPORT_TTL_DAYS = 30;

export interface MintedKey {
  /** Given to the caller once and never stored. Losing it means losing the report. */
  key: string;
  /** What we keep. A digest opens nothing. */
  hash: string;
  expiresAt: string;
}

/**
 * A new report key.
 *
 * base64url because the key travels in a URL fragment and in a header, and a key that
 * needs escaping in either place will eventually be mangled by something.
 */
export function mintReportKey(ttlDays: number = DEFAULT_REPORT_TTL_DAYS): MintedKey {
  const key = randomBytes(32).toString("base64url");
  return {
    key,
    hash: hashReportKey(key),
    expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function hashReportKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Constant time comparison of a presented key against a stored digest.
 *
 * Both sides are hashed first, so the buffers being compared are always the same
 * length whatever the caller sent. Comparing raw keys of differing lengths forces an
 * early return, and an early return is a measurable signal.
 */
export function reportKeyMatches(presented: string, storedHash: string): boolean {
  if (!presented || !storedHash) return false;
  const a = Buffer.from(hashReportKey(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: "no-key" | "wrong-key" | "revoked" | "expired" | "not-found" };

export interface ReportGrant {
  keyHash?: string;
  expiresAt?: string;
  revokedAt?: string;
}

/**
 * May this request read this report?
 *
 * Order matters. A revoked report is refused even with the right key, because revoking
 * is the thing a person reaches for when they know the link has escaped, and it would
 * be worthless if the escaped key still worked.
 *
 * A report with no grant recorded at all is refused rather than allowed. Failing open
 * on a missing field is how access control quietly stops existing after a schema
 * change that nobody noticed.
 */
export function decideAccess(
  grant: ReportGrant | undefined,
  presentedKey: string | undefined,
  now: Date = new Date(),
): AccessDecision {
  if (!grant?.keyHash) return { allowed: false, reason: "not-found" };
  if (!presentedKey) return { allowed: false, reason: "no-key" };
  if (!reportKeyMatches(presentedKey, grant.keyHash)) return { allowed: false, reason: "wrong-key" };
  if (grant.revokedAt) return { allowed: false, reason: "revoked" };
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime()) {
    return { allowed: false, reason: "expired" };
  }
  return { allowed: true };
}

/**
 * What a refused request is told.
 *
 * "Not found" for a missing report, a wrong key and a report that never had a grant,
 * because distinguishing them tells an attacker which run ids are real. Expiry and
 * revocation are stated plainly: those are answers a legitimate holder of the link
 * needs, and by the time either applies the key has already been shown to be correct.
 */
export function describeRefusal(reason: Exclude<AccessDecision, { allowed: true }>["reason"]): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "no-key":
      return {
        status: 401,
        message:
          "This report needs its access key. The key was shown once when the run was created and is part of the link, after the # symbol.",
      };
    case "revoked":
      return {
        status: 410,
        message:
          "This report has been revoked. Revoking is permanent: the key that opened it will not work again, and a new run is needed.",
      };
    case "expired":
      return {
        status: 410,
        message: `This report has expired. Report links last ${DEFAULT_REPORT_TTL_DAYS} days by default, because a finding about a site is only true of the site as it was on the day it was measured.`,
      };
    default:
      return { status: 404, message: "No such report." };
  }
}

/**
 * Headers every report response carries.
 *
 * Each of these is closing a way the document leaks after it has been legitimately
 * fetched, which is the part that URL secrecy was never going to cover.
 */
export function reportSecurityHeaders(): Record<string, string> {
  return {
    // A report that reaches a search index is public no matter how good the key was.
    "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
    // Never in a shared cache, never on disk. The key is a capability, and a cached
    // copy outlives the revocation that was supposed to end it.
    "cache-control": "private, no-store, max-age=0, must-revalidate",
    // The report links out to the site under test. Without this, that site's access
    // log records the address of a document about its own defects.
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
  };
}

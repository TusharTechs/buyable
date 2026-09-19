# ADR 0003: Report task completion, not rule violations

**Status:** accepted, 2026-09-20

## Context

The accessibility tooling market is mature and the scanning problem is solved. Deque's
axe DevTools has User Flow Analysis, Evinced has a Web Flow Analyzer, and both record
a journey and return a deduplicated list of WCAG violations. TestParty auto-fixes rule
violations and delivers them as pull requests.

All of these answer the same question: which rules does this page break?

That question has a known ceiling. Automated tooling detects roughly 20 to 40 percent
of WCAG issues, and only about 30 percent of success criteria are meaningfully machine
testable. The industry's own position is that real-user testing is the only way to
validate that a product is usable rather than merely conformant, and that this matters
most for authentication, payment and application flows.

## Decision

The unit of measurement is whether the journey completed, per persona, expressed as a
fraction of attempts. Violations are evidence for that verdict and are never a
substitute for it.

Three constraints follow, and none is negotiable:

1. **Completion is judged independently of the model.** `checkAssertion` runs against
   the live page. A model that claims success without satisfying the assertion yields
   `false_completion`, which is recorded as a distinct outcome rather than a pass.

2. **Baseline is a control, not a persona we care about.** If baseline completes and a
   constrained persona does not, the site is the variable and not the model. Without
   that control every finding would be an unfalsifiable accusation.

3. **Infrastructure errors never count against a site.** Runs with outcome `error` are
   excluded from the denominator entirely.

## Consequences

Good: the output is a claim a buyer can act on and a judge can verify in seconds.

Bad: runs are slower and more expensive than a scan, because completing a purchase
takes more steps than parsing a DOM. Mitigated by keeping scans in the loop for the
rule layer and spending the model budget only on the completion question.

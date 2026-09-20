# Is Buyable ready for real users?

**No. Not yet.** This document says why, with evidence, because a tool whose entire
argument is "stop trusting that it works, go and check" would be absurd to ship on the
strength of a demo that works.

Written 2026-09-20, after pointing Buyable at a real storefront for the first time.

## What is actually proven

These are verified against live infrastructure, not asserted.

| Claim | Evidence |
| --- | --- |
| Drives a managed browser and reads the real accessibility tree | AgentCore Browser over SigV4 WebSocket + CDP, Chrome 148 |
| Personas are enforced constraints, not prompts | The assistive persona has no code path to a pointer click |
| Completion is judged independently of the model | `checkAssertion` runs against the live page; a false claim is recorded as `false_completion` |
| Finds a real barrier and locates it | `#pay`, WCAG 4.1.2 and 2.4.6, on a deployed site |
| Fixes it and proves the fix | assistive 0 of 3 to 3 of 3 on a published patched build |
| Runs as a service | API, Step Functions, published report, guards all verified live |
| Refuses dangerous input | SSRF to instance metadata, private ranges, `file://`, all refused |

On a simple, static, self-owned site, Buyable does what it says.

## What broke on the first real site

Pointed at `demo.vercel.store`, a real Next.js storefront, both personas failed:

```
baseline : 14 steps, all click_selector on the same element, 14 in a row
assistive: 23 steps, 12 tab + 4 shift_tab, longest identical streak 8
```

Neither made progress. Neither noticed. The runs ended only because an upstream API
quota cut them off, not because anything in Buyable was watching.

Three causes, found by probing deterministically with no model in the loop:

1. **Nothing detected the absence of progress.** No fingerprint, no repeat detection,
   no abort. Fixed: the accessibility tree is now hashed before and after every action,
   the model is told when an action changed nothing, and a run that repeats a useless
   action is abandoned. Covered by `test/loop-detection.test.mjs`, which uses a stub
   provider so the test cannot pass for reasons outside the code under test.

2. **Stuck runs would have been published as site failures.** This was the dangerous
   one. A persona that cannot make anything happen is far more likely to mean Buyable
   could not drive the page than that a customer would be stuck, and reporting it as a
   barrier is an accusation we cannot support. Fixed: `inconclusive` is now a distinct
   outcome, excluded from every denominator and shown on the report.

3. **Quick navigation oscillated between two nodes forever.** Node references were
   resolved against the tree the model was shown rather than the live one, and a single
   page application mutates between the two. Measured: `next_button` cycling
   `13 -> 76 -> 13 -> 76`, where 76 was a transient "Close toast" control. Fixed by
   re-reading the tree at the moment of acting.

**Now verified end to end on the same real site that defeated it.** With a validated
provider, the journey Buyable could not drive at all this morning completes:

```
demo.vercel.store, add a t-shirt to the cart
  baseline   1/1  100%
  assistive  1/1  100%
  Journey Completion Rate 100%, site is the variable: no
  148 seconds, $0.036
```

Both personas finish, and the verdict correctly declines to blame a site that is not
at fault. Getting there took one more fix, and it was the same class of mistake as the
others: the identical-action detector fired on four consecutive `next_button` calls
while focus was advancing 83, 84, 85, 86. Pressing B repeatedly to move through
buttons is what a screen reader user does. A repeat only counts as a loop if it is
also achieving nothing, and the check now requires both.

## What is still missing for real users

Honestly enumerated. Roughly in order of how quickly each would bite.

### 1. Consent walls, which is every real site

Measured on three real sites, none of which Buyable can currently get past cleanly:

| Site | What stands in front of the journey |
| --- | --- |
| M&S | `alertdialog "We value your privacy"`, consent region is the second tab stop |
| Zalando | `dialog "We'll tailor your experience"`, plus a second unnamed dialog |
| GOV.UK | "Accept additional cookies" button, fifth tab stop |

Two distinct problems. Practically, every journey wastes steps on a modal, and a
focus-trapping consent dialog can strand the assistive persona in a way that looks
exactly like a real barrier. Ethically, an automated agent clicking "Accept all" on a
stranger's site manufactures a consent record for a person who does not exist, which
is not a thing this project should do casually.

This needs a product decision, not just code. See "Open questions" below.

### 2. The pull request story is not true for customers yet

The fix loop requires Buyable to hold the site's source, which today means the
fixture store. For a real customer it needs a GitHub App, repository permissions and a
way to map a live URL to the source that renders it. Until that exists, Buyable
diagnoses for everyone and remediates only for itself.

The remediation branch already returns this honestly rather than guessing:

> Buyable does not hold the source for this site, so it can diagnose the barrier but
> cannot propose a verified fix.

### 3. Reports are unauthenticated

Every report is world readable at its URL. The identifier is a UUID so it is not
guessable, but a link forwarded once is public forever. No enterprise will accept
that for a document listing how their checkout excludes customers.

### 4. No accounts, no tenancy, no history

There is no way to say "my scans", compare a journey over time, or stop a colleague
seeing another team's results. A scan is a one-off with no memory, which means the
regression story, arguably the most valuable one, does not exist.

### 5. No CI integration

For a development team the product is a check on every pull request, not a web form.
The API supports this; the GitHub Action does not exist.

### 6. Narrow blocker taxonomy

The classifier handles seven kinds and the fix generator is reliable on one: a control
with no accessible name. Focus traps, reading order, and anything needing judgement
about page structure are recognised at best and never repaired.

### 7. Untested territory

No evidence either way for: login-gated journeys, bot protection such as Turnstile,
multi-step forms with validation, locale and currency switching, or anything behind a
paywall. Each is common and each could fail in its own way.

### 8. Cost

Roughly $1.10 of model spend per three-persona, three-attempt journey. Fine for a
pull request check, expensive for scanning a hundred journeys nightly. Cheaper models
for navigation and reserving the strong one for diagnosis is the obvious lever, and it
is untried.

## Open questions that need a human decision

1. **Consent.** Reject all, accept all, or dismiss without consenting? Rejecting is
   the privacy-preserving default and matches what this project would argue for, but
   some journeys genuinely will not proceed without acceptance. Different answer for a
   site owner scanning their own site than for a public scanner pointed at a stranger.

2. **Whether public scanning should exist at all in its current form.** It answers the
   "you chose the fixture" objection, which is worth a great deal. It also means anyone
   can generate a public document about someone else's site. Report expiry, noindex,
   and an owner verification path for permanent reports are all options.

3. **Where the product actually is.** A CI check for teams who own their source, a
   diagnostic service for agencies and auditors, and a public scanner are three
   different products with three different shapes. They currently overlap.

## The honest summary

Buyable is a working, deployed, well-tested system that does something genuinely new,
and it is a strong hackathon submission. It is not yet a product an enterprise could
adopt, and the gap is not small: consent handling, repository integration,
authentication and tenancy are each real work.

What it has, which most things at this stage do not, is a habit of checking rather
than assuming. The real-site failure was found by pointing it at a real site and
reading the output, which is the same move the product asks its users to make. That
habit is worth more than the current feature list.

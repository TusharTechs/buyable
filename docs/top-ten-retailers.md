# Buyable against the world's largest retailers

What was run, what happened at each step, what works, and what does not. Written for
someone deciding whether to put this in front of their own checkout.

Run 2026-09-20. Every scan went through the deployed API, so `robots.txt` and the
request-forgery guards applied exactly as they would for any other caller. Nothing was
purchased, no account was created, and no site was visited more than a handful of
times.

## The short version

**The free page inspection works on 8 of 10.** Four seconds, no key, no account, and
it finds real defects on Amazon, Best Buy, Target and Shein.

**The journey proof works on some sites and not others**, and the reasons are
specific: bot protection, page size, and consent walls. It now says which, in seconds,
instead of leaving you waiting.

**Seven defects were found in Buyable itself during this exercise**, all of the same
shape, all of them wrongly blaming a site for something that was our limitation. They
are listed at the end, with the tests that stop each one recurring. That section is
the most useful thing in this document if you are evaluating whether to trust the
tool.

## Part one: the free inspection

One page load, no model, deterministic. It reads the accessibility tree Chrome
computed, applies rules, and prints the page as a screen reader would speak it.

| Retailer | Result | Blocking | Impairing | Tab stops | Time |
| --- | --- | --- | --- | --- | --- |
| Amazon UK | worked | 1 | 0 | 74 | 4s |
| AliExpress | worked | 0 | 10 | 199 | 6s |
| Target | worked | 7 | 5 | 91 | 6s |
| Etsy | worked | 0 | 1 | 159 | 7s |
| Best Buy | worked | 2 | 0 | 29 | 4s |
| IKEA | worked | 1 | 0 | 44 | 4s |
| Shein | worked | 1 | 6 | 86 | 5s |
| Walmart | interstitial, not the real page | 1 | 0 | 11 | 4s |
| eBay | served an error page | | | 1 | 4s |
| Argos | "Access Denied" | | | 0 | 3s |

### What it found

Each of these was checked by hand before being written down, because three separate
false-positive classes had to be removed before the numbers were worth anything.

**Amazon.** `#searchDropdownBox`, the "All Departments" selector beside the search box,
has no accessible name, and it is the **third tab stop on the page**. Tab into Amazon
with a screen reader and you hear:

```
1. "main content", link
2. "Amazon.co.uk", link
3. (no accessible name), combobox, value "All Departments"   <<< announces nothing
4. "Search Amazon.co.uk", searchbox
```

Thirty seconds to verify. WCAG 1.3.1, 3.3.2, 4.1.2.

**Best Buy.** The **first** tab stop announces nothing at all: a focusable container
with no accessible name. Also an empty link. A keyboard user's very first action lands
on silence.

**Target.** Seven "storycard" wrappers that respond to clicks but have no keyboard
handler and no role, so they work with a mouse and with nothing else. Each confirmed by
asking Chrome for the listeners actually attached, rather than inferred from styling.

**Shein.** An unnamed button in the header.

**Five retailers returned nothing**, including GOV.UK, NHS, M&S and WordPress in the
wider sample. That matters as much as the findings: a tool that reports problems
everywhere is not measuring anything.

### What it cannot do

Two sites refuse to serve us at all. Argos returns "Access Denied", eBay an error
page. Buyable does not evade bot protection, and a vendor who claims to scan any site
on the internet is either doing that or not telling you.

## Part two: the journey proof, step by step

This is the part that is different from a scanner. Three personas attempt a real task
under real constraints, and the verdict is whether the task could be completed.

### How a run actually proceeds

1. **Preflight**, three to sixteen seconds, no model. Loads the page once and decides
   whether the journey is worth attempting at all. Refuses, with a specific reason, if
   the site served a bot page, the page is an interstitial, a sign-in wall is in the
   way, the success condition is already true on the starting page, or the page is so
   much larger than the step budget that the run would exhaust itself navigating.
2. **Personas run in parallel**, each in its own isolated AgentCore browser session.
   Baseline sees the rendered page and uses a pointer. Assistive perceives only the
   accessibility tree and moves only by keyboard, including the quick navigation a
   screen reader provides. The agent persona reads the tree plus structured data.
3. **Every action is checked**, and a refusal explains itself: "the element is
   disabled", "no element matched", "this persona has no pointer".
4. **Completion is judged against the live page**, never from the model's claim.
5. **Runs that cannot be attributed to the site are excluded** from the verdict rather
   than counted against it.

### IKEA: a clean pass

```
Journey:  home page, search for a desk lamp, open the first product page
baseline   1/1  100%
assistive  1/1  100%
Journey Completion Rate 100%, site is the variable: no
236 seconds, $0.068
```

A screen reader user can search IKEA and reach a product page. That is a real result
on a production retailer, and it is the shape of what a passing report looks like.

### Target: the control failed and the screen reader user succeeded

```
Journey:  search results for "desk lamp", open the first product page
assistive  1/1  100%   completed in 14 steps
baseline   0/1         stopped by a press-and-hold bot challenge
```

The assistive persona navigated by heading, found the results, and opened the product
page. The baseline persona, which uses a pointer, was served a human-verification
screen and said so:

> The page is blocked by a bot detection verification screen. The required
> interactive press-and-hold action is neither in the DOM interactive elements nor
> supported by the available toolset.

Buyable reports `site is the variable: no`, which is correct: without a working
control there is no comparison to make. This run is also why bot challenges are now
detected as bot challenges. The first version attributed the baseline failure to the
search button, which was simply the nearest thing a fallback could see.

### Best Buy: refused, correctly

```
Preflight: 460 reachable controls against a 32 step budget, a ratio of 14 to 1
STOP. The run would almost certainly exhaust its budget while still navigating.
Refused in 16 seconds.
```

The first time this journey ran, it was allowed to proceed with a warning. It spent
six minutes, produced nothing, and cost thirteen cents. A warning about an outcome
that can already be predicted, followed by a charge for it, is not much of a warning.

### Etsy: refused, correctly

```
Preflight: 1 accessibility node, 1 reachable control
STOP. This is an interstitial rather than the real page.
Refused in 5 seconds.
```

### Amazon: the site fell over

The assistive persona was answered with a 503 partway through the journey. That is
the site being temporarily unavailable under our request rate, not the site excluding
anyone, and it is now recorded as inconclusive with that reason rather than filed as
a barrier.

## Part three: what went wrong in Buyable, and why that matters to you

The first question anyone serious asks about a tool like this is: *how do I know it is
not simply wrong about my site?* The honest answer is that it was wrong seven times in
one day, every single one of them in the same direction, and here they are.

| # | Defect | It would have told you |
| --- | --- | --- |
| 1 | The loop detector ignored focus changes | Your site blocks keyboard users |
| 2 | The identical-action check fired while focus was advancing | Your site blocks navigation |
| 3 | Running out of step budget was attributed to a barrier | Etsy excludes screen reader users |
| 4 | A persona with no usable attempts scored zero, read as failure | Etsy: "site is the variable" |
| 5 | The blocker locator matched one model's phrasing | No element identified |
| 6 | The control persona was blamed for an accessibility barrier | A missing label blocked a mouse user |
| 7 | A 503 and a bot challenge were recorded as barriers | Amazon and Target exclude disabled customers |

Every one of them treated a limitation of the harness as a failure of the site. Not
one could appear against the fixture, because the fixture is small, static, well
behaved, and ours.

What changed as a result is a rule that now runs through the whole system: **a run that
cannot be attributed to the site is excluded from the verdict rather than counted
against it.** In practice:

- A persona that stops without an identifiable barrier is `inconclusive`, not a failure.
- A persona with zero usable attempts has no rate, and cannot make a site "the variable".
- The baseline persona can never be blocked by an accessibility barrier, because it
  sees the DOM and uses a pointer, so by definition a missing label cannot stop it.
- Error pages, rate limiting and bot challenges are recorded as what they are.
- `test/attribution.test.mjs` pins all of it, so none of these can return quietly.

A clean ten out of ten would have been a more comfortable document and a much weaker
one. This is the argument for trusting the numbers: not that they have always been
right, but that every time they were wrong the failure is written down and there is a
test standing where it happened.

## What this costs

| Operation | Time | Cost |
| --- | --- | --- |
| Free page inspection | 4s | fractions of a cent, no model |
| Preflight refusal | 3 to 16s | fractions of a cent, no model |
| Journey, two personas, one attempt | 2 to 4 min | $0.03 to $0.13 |
| Journey with fix and verification | ~5 min | $0.08 |

## Honest limits

- **Two of the top ten refuse to serve us**, and that will not change.
- **Consent walls stand in front of nearly every real site.** Buyable does not dismiss
  them, and a focus-trapping one can strand a persona.
- **The fix loop needs the source.** Buyable diagnoses any site and remediates only
  sites whose repository it holds, which today means the fixture.
- **Reports are unauthenticated.** A link forwarded once is public.
- **Large pages need a closer starting point.** Home pages of major retailers exceed
  the step budget; search results and product pages work.

See [production-readiness.md](production-readiness.md) for the full list of what is
still missing before this is something an enterprise could adopt.

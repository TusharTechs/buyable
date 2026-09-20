# Buyable against fifteen real websites

What was run, what came back, what it means, and what it would be worth to someone
who owns one of these sites.

Run on 2026-09-20 through the deployed API at `POST /inspect`, so `robots.txt` and the
request-forgery guards applied exactly as they would for any other caller. Every site
was the public home page or a public article. Nothing was submitted, no account was
created, no order was placed, and each site was requested once.

## How each scan was done

One request. `POST /inspect` with a URL. No key, no account.

Behind it: an Amazon Bedrock AgentCore Browser session opens, the page loads, and
Chrome's own accessibility tree is read over the DevTools Protocol. That tree is the
thing that matters. It is not the HTML source, it is what Chrome computed *after*
resolving ARIA, labels, alt text and content, and it is what a screen reader reads
aloud. A button whose only content is an `aria-hidden` icon looks perfectly fine in
source and is empty in the tree.

Then three things are produced:

1. **Findings.** Rule checks, with a CSS selector and the WCAG success criteria.
2. **The announcement transcript.** The real tab sequence, with what a screen reader
   would say at each stop. Elements that are only focusable by script are excluded,
   because nobody reaches those by pressing Tab.
3. **A statement of what the scan cannot tell you**, on the report, every time.

Median 4 seconds.

## The results

| Site | Blocking | Impairing | Notes | Tab stops | Time |
| --- | --- | --- | --- | --- | --- |
| Wikipedia (Accessibility article) | 5 | 2 | 0 | 686 | 4.1s |
| BBC News | 0 | 2 | 0 | see caveat | 5.9s |
| NHS | 0 | 0 | 0 | 53 | 3.7s |
| GitHub | 0 | 0 | 1 | 102 | 4.9s |
| IKEA | 1 | 0 | 0 | 40 | 4.1s |
| Etsy | 0 | 1 | 0 | 143 | 7.1s |
| GOV.UK | 0 | 0 | 0 | 88 | 3.5s |
| Marks & Spencer | 0 | 0 | 0 | 126 | 4.0s |
| Vercel commerce demo | 1 | 0 | 0 | 34 | 3.6s |
| MDN Web Docs | 0 | 3 | 1 | 94 | 3.5s |
| WordPress.org | 0 | 0 | 0 | 64 | 3.7s |
| Stack Overflow | 0 | 1 | 1 | 176 | 4.8s |
| Booking.com | 2 | 0 | 1 | 54 | 7.8s |
| Buyable's own site | 0 | 0 | 0 | 13 | 3.3s |
| Our deliberately broken checkout | 1 | 0 | 0 | 11 | 3.4s |

**The most important number in that table is the last row.** A fixture with one known,
deliberately planted defect returns exactly one finding, on the right element, with
the right WCAG criteria. A scanner that finds nothing everywhere is worthless, and so
is one that finds something everywhere. This one is calibrated against a known answer.

**The second most important thing is that most of these are zeroes.** GOV.UK, NHS,
M&S, WordPress and Buyable's own site return nothing. Those are organisations with
real accessibility practices, and a tool that could not tell them apart from a broken
site would be noise.

## What it found, site by site

**Wikipedia, 5 blocking.** Five focusable links with no accessible name, announced as
just "link". On a 686-stop page a screen reader user hits five stops that say nothing
about where they lead. Worth knowing precisely because Wikipedia is otherwise
carefully built.

**IKEA, 1 blocking.** `#hnf-carousel__hnf-inpage-nav`, a carousel navigation list made
keyboard focusable with no accessible name. Focus lands there and the user hears
silence. One attribute.

**Booking.com, 2 blocking.** Two elements with a click listener, no keyboard listener
and no role. Mouse-operable and nothing else. These were verified by asking Chrome for
the listeners actually attached, not inferred from styling.

**MDN, 3 impairing.** Unlabelled images that are not inside a named control, so their
content is simply unavailable to anyone who cannot see them.

**Vercel commerce demo, 1 blocking.** A real defect in a widely-copied starter
template, which means it is probably replicated across a lot of production stores.

## What it could not do, stated plainly

**Two sites blocked us outright.** ASOS and H&M returned zero tab stops with the
hostname as the page title, which is what bot protection looks like. Buyable cannot
scan a site that will not serve it, and any vendor claiming otherwise is either
evading protections or not telling you.

**One site was inconsistent.** BBC News returned 169 tab stops on one run and zero on
another, most likely a consent interstitial or timing. A single scan of a busy page is
not always reproducible, which is an argument for scheduled scans rather than one-off
ones.

**Every real site puts a consent wall first.** Measured separately: M&S opens with an
`alertdialog "We value your privacy"`, GOV.UK's first three tab stops are the cookie
banner. The transcript makes this visible, which is useful, and Buyable does not yet
dismiss them, which limits journey testing.

**This is one page, checked against rules.** Automated checks catch a minority of
accessibility problems, and the majority of WCAG success criteria are not machine
testable at all. None of these scans attempted a task, so none of them can tell you
whether anyone can complete a purchase. That is the other half of the product.

## The three false-positive classes that had to be fixed first

The first run of these fifteen sites produced numbers that were not publishable, and
the fixes are more interesting than the feature.

| Symptom | Cause | Result |
| --- | --- | --- |
| Booking.com, 27 blocking | `<label>` was missing from the interactive-ancestor list, so `<label><span>Adults</span><input></label>`, the correct accessible pattern, was flagged | 27 to 2 |
| Etsy, 40 blocking, exactly the cap | `cursor: pointer` used as evidence. It is inherited and decorative, and it saturated the limit | 40 to 0 |
| M&S, 27 blocking in 188 seconds | Disabled buttons flagged as unreachable, which is correct behaviour, plus a selector resolved for all 313 nodes | 27 to 0, 188s to 4s |
| Wikipedia, 5 barriers | Unreachable and blocking treated as the same weight | Severity now follows reachability |

The `cursor: pointer` fix is the one worth dwelling on. It was replaced by
`DOMDebugger.getEventListeners`, which reports the listeners actually attached. The
surviving check is a stronger claim: *this element has a click listener, no keyboard
listener, and no role, so it works with a mouse and with nothing else.* Verifiable
rather than inferred.

## What this is worth to someone who owns one of these sites

**Today, free, in four seconds.** Hand a developer a CSS selector, the WCAG criteria,
and the exact phrase a screen reader speaks at that element. The usual output of an
accessibility tool is a violation count that nobody knows what to do with. A selector
and a sentence is a ticket.

**The transcript is the part people have not seen.** Most teams have never encountered
their own checkout as an ordered list of spoken phrases. On our fixture the silent
button sits at position 10, between "Expiry date" and the footer links, and nobody
needs the concept explained after seeing that.

```
 9. "Expiry date", textbox, value "04/29"
10. (no accessible name), button   <<< announces nothing
11. "Shop", link
```

**In regression, which is where the value compounds.** A four second scan fits in a
pull request check. The question stops being "how accessible is our site" and becomes
"did this change break something", which is a question engineering teams already know
how to act on.

**And the honest limit.** Everything above is a rule check, which is what every
scanner does. It cannot tell you whether a customer can finish buying. Answering that
needs a model driving a real browser under real constraints, and it is the paid half
of the product.

## Why the paid half needs a good model, demonstrated rather than asserted

The journey proof was validated against two free models, using the fixture whose
answer is already known. Both failed, in instructively different ways.

**`openai/gpt-oss-120b` guessed.** Shown a checkout whose only control was a button
with no accessible name, as the persona that stands in for a screen reader user, it
pressed it anyway: *"activate the focused button to proceed with checkout."* Every
run on that model would have reported disabled shoppers completing purchases they
cannot complete. Silently wrong is the worst failure available here.

**`qwen/qwen3.8-27b` looped.** It clicked an already-selected size radio four times
without noticing it was done. The loop detector caught it and recorded the run as
`inconclusive`, excluded from the verdict rather than blamed on the site.

Neither is a harness defect. The conclusion is a product one: the free tier is
deterministic and needs no model, and the journey proof needs a capable one. That line
is exactly where the price should sit, and `tools/validate-provider.mjs` now enforces
it, so no provider can quietly start producing numbers it has not earned.

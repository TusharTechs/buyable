# Buyable report 17ef2231-3565-4be8-8d1c-15cdc93dd5e9

**Journey:** Buy the Harrier Trail in UK size 9
**Start URL:** https://d2dvlfc6rcbvw8.cloudfront.net/index.html
**Run at:** 2026-09-20T04:12:29.664Z

## Verdict

| Persona | Completed | Rate |
| --- | --- | --- |
| baseline | 3 of 3 | 100% |
| assistive | 0 of 3 | 0% |
| agent | 3 of 3 | 100% |

**Journey Completion Rate: 67%**

The baseline control completed this journey every time and at least one constrained persona never did. The site is the variable, not the model.

## Completions that were guesses

**agent** completed this journey 3 of 3 times, and 3 of those completions required activating a control with no accessible name.

A screen reader user cannot do this, because not knowing what a control does is precisely why they stop. An agent can, and did, because it acts on inference. What it inferred:

- `<button>` `#pay`: Click the button to confirm payment and complete the order for the Harrier Trail shoe in UK size 9.
- `<button>` `#pay`: I need to click the button to complete the checkout and confirm the order. The button at node 33 should be the submit/confirm button.
- `<button>` `#pay`: I need to click the button to complete the checkout and confirm the order. The button at node 33 appears to be the submit/confirm button for the checkout form.

## What stopped them

### assistive, step 31

A button announces nothing, so neither a screen reader user nor an AI agent can tell what it does.

- Element: `<button>` with accessible name (empty)
- Selector: `#pay`
- WCAG: 4.1.2, 2.4.6

> I am focused on node [33], which is a button with no accessible name. The screen reader announces "(no accessible name), button" which means I cannot determine what this button does. I need to know what this button is labeled as to confirm whether it is the correct button to complete the purchase and confirm the order.

## Remediation

`checkout.html`

```diff
--- a/checkout.html
+++ b/checkout.html
@@ -87,7 +87,7 @@
 
         The fix is one attribute. See docs/fixture-notes.md.
       -->
-      <button class="pay-btn" id="pay">
+      <button class="pay-btn" id="pay" aria-label="Pay now">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
           <rect x="2" y="5" width="20" height="14" rx="2"></rect>
           <path d="M2 10h20"></path>
```

The button has no accessible name because its only content is an SVG marked aria-hidden. Adding aria-label gives the button an accessible name so screen reader users know it is the payment button.

Re-running the same journey with the same persona on the patched build moved completion from 0% to 100%.

## Method

- Reasoning: anthropic:claude-sonnet-4-5-20250929
- Browser: Amazon Bedrock AgentCore Browser (aws.browser.v1)
- Attempts per persona: 3

The baseline persona is the control. It perceives the rendered page and uses a pointer. When baseline completes the journey and a constrained persona does not, the site is the variable rather than the model. Runs that failed for infrastructure reasons are excluded from every denominator.

Model cost for this report: $0.9802. Token counts are measured. The dollar figure is those counts multiplied by published list price, so it is arithmetic rather than a billed amount.
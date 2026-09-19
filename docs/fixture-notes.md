# Fixture notes

The demo store exists so that a claim about Buyable can be checked rather than taken
on trust. This file records what is deliberate in it, so the fixture can be audited.

## The one defect

`apps/demo-store/public/checkout.html`, the pay button:

```html
<button class="pay-btn" id="pay">
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"> ... </svg>
</button>
```

It is a real `<button>`. It is keyboard reachable. It is announced as a button. What
it lacks is an accessible name, because its only content is an `<svg>` marked
`aria-hidden`. A screen reader announces `(no accessible name), button`.

This is how the bug actually happens in production: a developer correctly hides a
decorative icon from assistive technology and does not notice that the icon was the
button's only source of a name. It is not an exotic failure, and it is not one a
rule scanner treats as urgent.

Verified against the deployed site with `tools/inspect-axtree.mjs`: the checkout page
has 66 accessibility nodes and exactly one silent interactive control, which is this
button. Output kept in `docs/evidence/axtree-checkout-broken.txt`.

## What is deliberately correct

Everything else, because a fixture with several defects would not isolate anything.

- Every form field has a `<label for>`.
- Sizes are real radio buttons in a `<fieldset>` with a `<legend>`, not clickable divs.
- Every link has text. Every image role has an `aria-label`.
- There is a skip link, landmarks are used, and heading levels are in order.
- Focus is always visible. `:focus-visible` has a 3px outline and is never removed.
- Status messages use `role="status"` so they are announced.

If a persona fails anywhere other than the pay button, that is a bug in Buyable or a
mistake in this fixture, not a finding.

## Why the defect is on the last step

A shopper using a screen reader can browse the catalogue, read the product, choose a
size, add to the basket, review it, and type a full delivery address. Then they reach
the moment of payment and stop.

That placement is the argument. A violation count treats this as one low-severity
item among dozens. Measured by task completion it is total: the purchase cannot be
made at all. Those two descriptions of the same page are the reason this project
exists.

## What the fixture does not do

It takes no payment, stores nothing, and transmits nothing. The card number in the
form is a well-known test value that belongs to no one, and the pay button only
writes to `sessionStorage` and navigates.

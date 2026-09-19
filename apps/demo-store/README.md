# Demo store

A deliberately small storefront used as a reproducible fixture for Buyable.

Everything here is accessible except for one defect, placed on purpose at the final
step of the purchase: the **Complete purchase** button on `checkout.html` is an
icon-only button with no accessible name.

That placement is the point. A shopper using a screen reader can browse, choose a
size, add to the basket and enter their address, and is then stopped at the moment
of payment by a single missing attribute. Automated rule scanners report it as one
low-severity warning among dozens. Buyable reports it as a purchase that cannot be
completed.

The fix is one attribute. `docs/fixture-notes.md` records why each page is built the
way it is, so the fixture can be audited rather than taken on trust.

# Builder Center submission

Everything the form asks for, ready to paste. Copy the fenced blocks exactly.

**Deadline: 2 October 2026, 11:59 PM PDT.**

---

## Title

```
Buyable: proof that a customer using a screen reader, or an AI shopping agent, can actually finish buying
```

## Description

512 characters maximum. This one is 498.

```
Every accessibility tool counts the rules your site breaks. None of them tell you whether anyone can complete a purchase. Buyable attempts a real checkout three times over: as someone using a screen reader, as an AI shopping agent, and as a sighted control with a mouse. It reports whether each one finished, finds the element that stopped them, writes the patch, and re-runs the journey against a patched build to prove the fix moved the number. Built on Amazon Bedrock AgentCore Browser.
```

## Tags

Five maximum. Two are mandatory: one category, one lane.

```
#commercial-potential
#startup
#accessibility
#bedrock-agentcore
#ai-agents
```

**Why `commercial-potential` and not `social-good`:** the Social Good category is
scoped to Education, Health and Climate resilience. Accessible checkout is none of
those three, and claiming a category that does not fit is the kind of thing this
project exists to argue against. Buyable is a vertical SaaS tool sold to merchants on
a revenue and compliance argument, which is exactly what Commercial Potential
describes. The impact on disabled shoppers is real and belongs in the body, not in a
category it does not qualify for.

**Why `startup` and not `community`:** there is a product here with a path to a first
user base, priced work, and a CI distribution channel.

## Links

| Field | Value |
| --- | --- |
| GitHub repository | `https://github.com/TusharTechs/buyable` |
| Endpoint or live demo | `https://d3luufd5s1g5pn.cloudfront.net` |
| Jupyter or SageMaker notebook | **leave blank** |

The notebook field is optional and is there for projects whose work lives in one:
SageMaker training, data analysis, model evaluation. Buyable is a TypeScript and CDK
application, and its reproducible experiment already ships as a command anybody can
run against the deployed fixture:

```bash
node tools/validate-provider.mjs gemini gemini-flash-lite-latest
```

Wrapping that in a notebook to fill a field would add a layer nobody asked for and
would read as padding to a judge who opened it. An empty optional field costs nothing;
a notebook that exists to look thorough costs credibility.

## Cover image

`docs/submission-cover.png`, 1200 by 675, 387 KB. Under the 2 MB limit.

---

## Body

Paste with the Markdown toggle on.

````markdown
## The question nobody is answering

Every accessibility tool on the market counts violations. They will tell you your site
has 47 issues across 12 rules. None of them will tell you the thing you actually need
to know: **can a customer complete a purchase?**

Those are different questions, and the gap between them is money.

- **55 percent of online shoppers with disabilities** have abandoned a purchase because
  of accessibility barriers. In the UK alone that is 4.3 million shoppers and around
  17 billion pounds of spend walking away. (Click-Away Pound research)
- **AI shopping agents read the same accessibility tree a screen reader does.** A CHI
  2026 study from UC Berkeley and the University of Michigan measured agent task
  success falling from 78 percent to 42 percent on sites with a degraded accessibility
  tree.
- **The European Accessibility Act has been enforceable across all 27 member states
  since June 2025.** In June 2026 a French court ordered Carrefour to make its
  e-commerce site and app accessible within six months.

One missing attribute closes two revenue channels at once, and creates a legal
exposure. A tool that hands you 47 line items has not told you which one of them does
that.

## What Buyable does

It takes a real revenue journey, a checkout, a booking, an application, and attempts
it three times over:

| Persona | What it gets | What it stands for |
| --- | --- | --- |
| **Baseline** | the rendered page, a mouse, the DOM | a sighted customer. **The control.** |
| **Assistive** | the accessibility tree, the keyboard, screen reader quick navigation | a customer using a screen reader |
| **Agent** | the accessibility tree and structured data, no vision, no pointer | an AI shopping agent |

Three isolated browsers, running at the same time, on the same page. It reports
completions over attempts for each one.

When a constrained persona cannot finish and the control can, Buyable locates the
element responsible, proposes a patch, publishes a patched build, and **re-runs the
same journey against it**. A patch that applies cleanly and does not move the number
is reported as unproven.

On the fixture store, the assistive persona went from **0 of 3 to 3 of 3**. Diagnosis
through verified fix took five minutes and eight cents.

## Try it on any URL, without an account

Paste any URL into the free inspection at
**https://d3luufd5s1g5pn.cloudfront.net**. No key, no sign-up, no model. It reads the
accessibility tree Chrome actually computed and shows you the page as a screen reader
hears it.

Here is what it found on India's Income Tax Department portal, the one every taxpayer
in the country is required to use:

```
FINDINGS  20 blocking, 5 impairing

  [blocks] Keyboard focus lands on a generic that announces nothing, so a screen
           reader user hears silence and cannot tell what they have reached.
           WCAG 4.1.2, 2.4.3
```

Seven of those are the cards in the "our services" row:

```html
<div class="field field--name-field-title ..." tabindex="0" role="presentation">
  <span>NUDGE Campaign</span>
</div>
```

`tabindex="0"` makes it keyboard focusable. `role="presentation"` removes it from the
accessibility tree. A keyboard user tabs onto it and hears silence, seven times in a
row. Verified against the live DOM, element by element.

Sixteen sites have been swept this way. A sample:

| Site | Blocking | Impairing | Tab stops | Time |
| --- | --- | --- | --- | --- |
| Flipkart, men's footwear | 70 | 149 | 285 | 138s |
| Wayfair, living room | 22 | 55 | 566 | 74s |
| Income Tax Department | 20 | 5 | 180 | 33s |
| Lenskart, eyeglasses | 18 | 21 | 142 | 45s |
| India Post | 1 | 0 | 146 | 17s |
| **Nike, men's shoes** | **0** | 83 | 398 | 70s |
| **Apple, buy MacBook Air** | **0** | 1 | 142 | 14s |

**The two zeroes are the most important rows in that table.** Neither is a scan that
failed; both pages were fully served and fully read, at 398 and 142 tab stops. A tool
that finds problems everywhere is a random number generator with a WCAG citation
attached, and Nike and Apple are the control on that.

Seven more sites were not measured at all, and are reported as not measured rather than
as clean: Ajio, Meesho, BigBasket and Sephora refused to serve an automated client,
Myntra was in maintenance, Uniqlo served an interstitial, and Decathlon returned a 404.

## Three things that make a Buyable result mean something

**1. A persona is a constraint, not a prompt.** This is the part people assume is
system-prompt theatre. It is not. Each persona is a hard limit enforced in the tool
layer: the assistive persona has no code path to a pointer click, and the schema it is
handed never contains the option. A model cannot try harder past a capability it does
not have.

**2. Completion is judged against the live page, never the model's claim.** A model
that reports success without satisfying the assertion is recorded as a
`false_completion`, which is a distinct and more interesting outcome than a plain
failure.

**3. A run that cannot be attributed to the site is excluded from the verdict, not
counted against it.** This rule cost more engineering than any feature, and it is the
reason to trust the numbers.

## The most useful thing in this submission: what went wrong

In one day, Buyable produced seven wrong results. Every one had the same shape, and
every one blamed a real retailer for a limitation of our tool.

| # | The defect | What it would have told you |
| --- | --- | --- |
| 1 | The loop detector ignored focus changes | "Your site blocks keyboard users" |
| 2 | The identical-action check fired while focus was advancing | "Your site blocks navigation" |
| 3 | Running out of step budget was attributed to a barrier | "Etsy excludes screen reader users" |
| 4 | A persona with zero usable attempts scored 0 percent | "Etsy: site is the variable" |
| 5 | The blocker locator matched only one model's phrasing | "No element identified" |
| 6 | The control persona was blamed for an accessibility barrier | "A missing label blocked a mouse user" |
| 7 | A 503 and a bot challenge were recorded as barriers | "Amazon and Target exclude disabled customers" |
| 8 | The free inspection reported findings from a 404 template | "Decathlon has 8 accessibility problems" |
| 9 | The provider validator condemned a model over our own network error | "This model must not be used" |
| 10 | The free inspection read pages before they finished loading | "Nike has 99 unnamed links" |

Numbers 8, 9 and 10 were found after the first seven had been fixed, in the parts
nobody had thought to check: the free page inspection, and the tool whose entire job is
to police exactly this.

Number 10 is the one worth reading. The inspection slept three seconds and then read the
accessibility tree, which on a heavy page is a photograph of it halfway through getting
dressed:

```
Income Tax Department portal
  t=4s    342 nodes,  90 focusable,  5 controls with no accessible name
  t=10s   442 nodes, 181 focusable,  0 controls with no accessible name
```

All five had perfectly good labels. So did Nike's 99. **Both numbers are retracted.**

Worse: Nike's 99 had been checked by hand in a separate browser before being written
down, and the hand check agreed at 290. Both were wrong, because both used `innerText`,
which returns empty for `visibility: hidden` elements. They were hidden mega-menu links
that Chrome correctly excludes from the accessibility tree. **Two methods agreeing is
not corroboration when they share an assumption.**

The fix stops staring at the tree and asks the page whether it has finished loading and
stopped fetching. It costs 14 to 74 seconds instead of 4 to 11, which is the right
trade for a tool whose only real product is not being wrong.

Not one could have appeared against our own fixture, because the fixture is small,
static, well-behaved and ours. They were found by pointing the tool at Amazon, Etsy,
Target and Best Buy and reading the output carefully, which is the same move the
product asks its users to make.

`packages/engine/test/attribution.test.mjs` now stands where each one happened.

A clean ten out of ten would have made a more comfortable submission and a much weaker
one.

## The model is part of the instrument, and we measured that too

Buyable's finding is a behaviour, not a capability: asked to finish a purchase where
the only remaining control is a button with no accessible name, the assistive persona
should stop and say why, because that is what a person using a screen reader does.

That behaviour belongs to the model. So the model is validated against a fixture whose
answer is already known, and no provider may publish numbers until it passes.

| Model | Assistive persona | Verdict |
| --- | --- | --- |
| `gemini-3.8-flash` | stopped at `#pay` and said why | **VALID** |
| `gemini-flash-lite-latest` | **completed the purchase** | NOT VALID |

Same page, same journey, same provider. One reported a barrier. The other reported a
successful checkout. Here is how the second one did it, verbatim:

```
it completed by activating 1 control(s) it could not identify:
  <button> #pay
  guessed: "Press Enter on the submit order button (which has no accessible
           name) to complete the purchase of the Harrier Trail UK size 9."
```

**It knew.** It wrote "which has no accessible name" into its own reasoning and pressed
the button anyway, inferring from the order summary that it was probably the right one.
It happened to be right. A run on that model would have reported *screen reader users
complete this checkout, 100 percent*, and nothing about the report would have looked
wrong.

A merchant does not choose which agent visits their site. One model loses the sale.
Another gambles with a payment. Both are the merchant's problem, and Buyable records
the second as a **blind activation**, reported separately and never counted as a clean
pass.

Reproduce it in two minutes for a penny:

```bash
node tools/validate-provider.mjs gemini gemini-3.8-flash          # passes
node tools/validate-provider.mjs gemini gemini-flash-lite-latest  # fails
```

Full study, including what it does not show, in
[docs/model-study.md](https://github.com/TusharTechs/buyable/blob/main/docs/model-study.md).

## Architecture

The full set of diagrams, including the persona constraint model and the attribution
decision tree, is in
[docs/architecture.md](https://github.com/TusharTechs/buyable/blob/main/docs/architecture.md).

```mermaid
flowchart LR
    Q["Start URL<br/>Goal<br/>Proof it finished"] --> PRE["Preflight<br/>no model, seconds"]
    PRE -->|"not worth running"| STOP["Refused, with<br/>the specific reason"]
    PRE --> FAN["Step Functions<br/>parallel"]
    FAN --> B["BASELINE<br/>page + mouse<br/><i>the control</i>"]
    FAN --> A["ASSISTIVE<br/>tree + keyboard"]
    FAN --> G["AGENT<br/>tree + data"]
    B & A & G --> ACB["AgentCore Browser<br/>one session each, over CDP"]
    ACB --> CHECK["Assert against the LIVE page,<br/>never the model's claim"]
    CHECK --> V{"Control finished,<br/>constrained persona<br/>did not?"}
    V -->|"no"| PASS["Everyone finished,<br/>or nothing attributable"]
    V -->|"yes"| FIX["Locate it, patch it,<br/>publish a shadow build,<br/>re-run the same journey"]
    FIX --> PROOF["Proven only when<br/>the number moves"]
```

**AWS services:** Bedrock AgentCore Browser (sandboxed Chrome per persona, driven over
a SigV4-signed WebSocket carrying Chrome DevTools Protocol), Step Functions, Lambda,
DynamoDB, S3 with Object Lock, CloudFront with OAC, API Gateway HTTP API, Cognito,
Secrets Manager, CloudWatch, AWS Budgets.

**Why raw CDP rather than Playwright:** `Accessibility.getFullAXTree` returns the tree
Chrome actually computed, with the ignored nodes and the computed properties intact.
Every abstraction above it loses the fidelity that this entire product depends on.
([ADR 0001](https://github.com/TusharTechs/buyable/blob/main/docs/adr/0001-raw-cdp-over-agentcore-browser.md))

## Where it ships: a check on every pull request

A web form is how you try Buyable. It is not how you use it.

```yaml
- uses: TusharTechs/buyable@main
  with:
    url: ${{ steps.deploy.outputs.preview-url }}/checkout
    goal: Add a product to the basket and reach the checkout page
    proof: Order summary
    fix: true
```

This also closes the gap that mattered most. Buyable could diagnose anybody's site and
fix only its own, because fixing needs the source and the hosted service does not have
anyone's. The expected answer was a GitHub App with repository permissions, which is a
lot of machinery and a lot of trust to ask for.

**Running inside the customer's own CI removes the problem rather than solving it.**
Their source is already checked out on the runner and their preview deployment already
has a URL. Buyable drives that URL, locates the element in the checkout on the same
machine, and writes the change into the working tree. Their workflow opens the pull
request, from their repository, with their token. The code never leaves the runner.

The check fails for exactly one thing: a persona stopped by a barrier the control got
past. A preview serving an anti-bot page, a browser session that fell over, a control
that could not finish either, each reports its reason and passes. A check that goes red
for infrastructure noise is switched off within a week, and then it protects nobody.

## How the coding agent was actually used

Claude Code, connected to AWS through the AWS MCP Server. The proof is in
[docs/coding-agent/](https://github.com/TusharTechs/buyable/tree/main/docs/coding-agent),
and it is CloudTrail's word rather than ours: `userAgent` and `sourceIPAddress` both
reading `aws-mcp.amazonaws.com`, which is a value AWS writes and no client can set.

**Where it was genuinely load-bearing:**

- Working out how to reach the AgentCore Browser automation stream. The endpoint is a
  SigV4-signed WebSocket carrying CDP, and getting the signing right took a scripted
  probe rather than a guess.
- Diagnosing a Bedrock account restriction by elimination: IAM, model agreements,
  region, inference profile and a non-Anthropic model were each ruled out before
  concluding it was account-level. That produced the provider seam, which is now the
  reason the system is not tied to one vendor.
- Two transport failures that read as unrelated bugs: Bedrock's HTTP/2 default failing
  behind a TLS-inspecting proxy, and DynamoDB refusing to marshal an undefined field.
- All seven attribution defects above were found by the agent running the tool against
  real retailers and reading the output, not by inspecting the code.

**Where it was wrong, and how that was caught:**

For most of the build the agent believed it was connected to AWS through the MCP
Server. It was not; it had been using the AWS CLI over a shell tool the whole time. The
gap was found by checking the actual configuration rather than trusting the assumption:
global config, project config, all 36 project entries and the plugin directory
contained no AWS MCP server at all.

That correction is left standing in the repository even though the connection now
works, because deleting it once it stopped being true would be exactly the tidying-up
this project argues against. The belief was confident, reasonable, and wrong, and the
only thing that settled it was going and looking.

Buyable exists because "the checkout works" is a belief of exactly that kind.

## Honest limits

- **Two of the top ten retailers refuse to serve us at all.** Buyable does not evade
  bot protection, and a vendor claiming to scan any site on the internet is either
  doing that or not telling you.
- **The fix generator is reliable on one kind of defect**, a control with no accessible
  name. Focus traps and reading order are recognised and never repaired.
- **Consent platforms inside a closed shadow root or a cross-origin iframe are
  invisible** to the accessibility tree we read, so those dialogs cannot be detected.
- **This measures completion. It does not claim conformance**, and it is not a
  substitute for an audit by people who use assistive technology every day.

The full list is in
[docs/production-readiness.md](https://github.com/TusharTechs/buyable/blob/main/docs/production-readiness.md),
a document whose first line is "No. Not yet."

## Try it

| | |
| --- | --- |
| Live app | https://d3luufd5s1g5pn.cloudfront.net |
| A real report | https://d3luufd5s1g5pn.cloudfront.net/sample-report.html |
| Source | https://github.com/TusharTechs/buyable |

Paste any URL into the free inspection. It needs nothing from you, and it waits for
the page to finish loading before it reads anything.
````

---

## Before publishing, check each of these

The qualifying requirements are pass-or-fail. Every one is verified below.

| Requirement | Status |
| --- | --- |
| Coding agent connected to AWS, with documented proof | `docs/coding-agent/`, CloudTrail records `userAgent: aws-mcp.amazonaws.com` on two dates |
| Live application on AWS, reachable by public URL | `https://d3luufd5s1g5pn.cloudfront.net`, HTTP 200 |
| Reachable by the AI scoring system | 11,310 characters of visible text in `<main>` with JavaScript disabled |
| One of five app categories | `#commercial-potential` |
| A lane | `#startup` |
| Original, not published before | First commit 2026-09-19, public repository |
| Shows the development process | The "what went wrong" section, and `docs/production-readiness.md` |
| Shows how the coding agent helped | Its own section, including where it was wrong |
| Category and lane stated in the project | In the tags and in the body |
| Link to the live app | In the body and in the Endpoint field |

## Two things only you can do

1. **Add the repository topics on GitHub.** The `gh` CLI on this machine is not
   authenticated. Either run `gh auth login` and then the command in the next section,
   or paste them into the About panel on the repository page.
2. **Publish the project before 2 October, 11:59 PM PDT.** The ship gate is
   pass-or-fail and nothing else in this document matters if the deadline passes.

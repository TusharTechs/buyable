# AWS Zero to Shipped 2026 — Deep Research, Competitive Analysis & Project Selection

**Prepared:** 20 September 2026
**For:** Tushar Agrawal (working professional, GoKwik, India)
**Verification status:** All hackathon facts read directly off the live official pages on 20 Sep 2026. Market claims cited. Anything I could not confirm is marked **UNVERIFIED**.

---

## SECTION 1 — HACKATHON FACTS (verified against official pages)

Source: [Zero to Shipped — About](https://builder.aws.com/build/hackathons/e83e84e5-4f4c-383b-bbe9-4a15ac195d55/zero-to-shipped) and [Rules tab](https://builder.aws.com/build/hackathons/e83e84e5-4f4c-383b-bbe9-4a15ac195d55/zero-to-shipped?tab=rules) (Terms last updated 18 Sep 2026).

### The single most important fact

**Submissions are due 2 October 2026, 11:59 p.m. PT.** That is **12 days from today**, not "enough time to build a serious MVP" as your brief assumed. Every recommendation below is re-scoped to that reality. This is the biggest correction in this document.

### Timeline

| Milestone | Date |
|---|---|
| Launch | 18 Sep 2026, 9:00 a.m. PDT |
| **Projects due** | **2 Oct 2026, 11:59 p.m. PT** |
| Gate 1 (AI + human scoring) | Week of 5 Oct |
| Gate 2 (human judging) | Week of 12 Oct |
| Winners announced | Week of 19 Oct |

### Eligibility — you are eligible

- 18+, with a builder.aws.com profile. ✅
- **Excluded countries:** Argentina, Australia, Brazil, Hong Kong, Indonesia, Italy, the Philippines, Vietnam, Singapore, Russia, Cuba, Iran, North Korea, Syria, Belarus, Crimea, DNR, LNR, UAE. **India is not on the list.** ✅
- Excluded: Amazon/AWS employees, subsidiaries and affiliates, and their immediate family/household. **GoKwik is an independent VC-backed company (Peak XV/Sequoia India, Matrix Partners India, RTP Global, Think Investments; ~$128M raised, founded 2020) — not an Amazon subsidiary or affiliate.** ([Crunchbase](https://www.crunchbase.com/organization/gokwik), [Tracxn](https://tracxn.com/d/companies/gokwik)) ✅
- Being a working professional rather than a student is **irrelevant** — there is no student requirement anywhere in the rules. ✅
- **Limit one entry per person.**
- AWS will verify eligibility at the finalist stage against LinkedIn/public profiles, and can disqualify **even after the winner announcement**. So your Builder Center profile and LinkedIn must agree: India, 18+, employer GoKwik.

**Two employment cautions that are yours, not AWS's:**
1. **GoKwik IP/moonlighting.** Your employment agreement almost certainly assigns IP created in your field of work. The hackathon requires a *published, public* project and pushes the Startup lane. Do not build anything that overlaps GoKwik's product surface (checkout, COD/RTO risk, payments orchestration, D2C engagement). I have deliberately excluded every idea in that adjacency from the recommendation. **UNVERIFIED — I cannot read your contract; check it or get written sign-off before you publish.**
2. **Conflict-of-interest clause.** The rules require that receiving the prize does not create a conflict of interest for AWS, e.g. an ongoing competitive procurement. If GoKwik is mid-procurement with AWS, flag it. Low risk but non-zero.

### Submission requirements (all mandatory)

1. **A coding agent connected to the AWS console**, with **documented proof** of the connection.
2. **A live application running on AWS, reachable at a public URL.**
3. One of five **app categories** (tag required).
4. One **lane**: Community or Startup (tag required).
5. A **published project on Builder Center** covering: proof of agent connection, the project and development process, category + lane, and the live URL.
6. **An original application that has not been previously published.**
7. Documented use of AWS services and the coding agent.

### The ship gate (pass/fail, no exceptions)

> Live on AWS, reachable via public URL **at the time of evaluation**, accessible to both the AI scoring system and human judges, with documented proof of coding-agent connection.

Practical consequences most entrants will get wrong:
- Evaluation happens the **week of 5 Oct and again the week of 12 Oct** — your URL must stay up for ~3 weeks *after* the deadline, not just on 2 Oct. Budget for it. Free Tier + a sleeping container that cold-starts into a 504 will kill you.
- "Accessible to the AI scoring system" means **an automated crawler must be able to load and understand it**. If your app is a login wall, a WebSocket-only SPA, or renders nothing without JS, you risk failing the gate silently. Ship a public, server-rendered landing/demo route that needs no auth.

### Judging criteria — four equal weights, both gates

| Criterion | Weight |
|---|---|
| Technical Innovation & Originality | 25% |
| Implementation Quality | 25% |
| Community/Market Impact | 25% |
| Creativity & Storytelling | 25% |

- **Gate 1:** AI scoring + human review of all qualifying submissions → **top 100 advance**.
- **Gate 2:** panel of AWS experts + community leaders → **5 winners across the app categories**.

Judges listed publicly: Bhavin Patel (AWS Startups SA), Abdullah Karaman, Raghuram (Senior SA), Manuela (SA), Hamza Alfarrash. **Four of five are Solutions Architects.** Architecture quality is not a tiebreaker here — it is a quarter of the score and it is the thing this panel is professionally best at detecting.

### Categories

| Category tag | Official description |
|---|---|
| `#workplace-efficiency` | Task automation, team dashboards, workflow engines |
| `#daily-life-enhancement` | Smart home, personal assistants, habit trackers |
| `#commercial-potential` | SaaS tools, marketplace apps, vertical solutions |
| `#social-good` | **Education, Health, or Climate resilience only** — measurable improvement for underserved populations |
| `#personal-expression` | Art generators, music tools, content platforms |

Lane tags: `#startup` or `#community`.

**Important correction to a common assumption:** Social Good is *not* a general "does good in the world" category. The hackathon built its criteria with the AWS Skilling and Social Impact team so projects can qualify for [AWS Social Impact Credits](https://pulse.amazon/application/9XSD9BPP?source=zerotoshipped2026), and that programme's eligibility is explicitly **education, health, or climate resilience** (health applicants must be based outside the US). Accessibility, financial inclusion, civic tech etc. do **not** cleanly qualify. Do not mis-tag into Social Good hoping for a softer field — a mis-fit there scores worse, not better.

### Prizes

5 winning projects × ($5,000 AWS promotional credits + ~$600 swag + certificate + digital badge). Total pool $28,000. Credits have no monetary value and are subject to the AWS credit terms. Winners may be featured at re:Invent 2026.

**Calibrate on this:** the prize is credits and visibility, not money. The real returns are (a) the re:Invent/Builder Center showcase, (b) a shipped public product you own, (c) AWS SA relationships. Optimise the build for something you'd want to keep running on 1 November.

### Restrictions and things the rules explicitly do NOT prohibit

| Question | Answer | Confidence |
|---|---|---|
| Can I use Claude / Claude Code as the coding agent? | **Yes.** The rules say only "a coding agent connected to the AWS console" — no named tool, no exclusions. AWS's own [Agent Toolkit for AWS](https://aws.amazon.com/products/developer-tools/agent-toolkit-for-aws/) page explicitly lists **Claude Code, Kiro, Codex, Cursor and any MCP-compatible agent**. | High |
| Are external APIs / third-party SaaS allowed? | Not prohibited anywhere. The requirement is that the app *runs on AWS*, not that it only uses AWS. | Medium — **UNVERIFIED by explicit statement** |
| Are open-source / non-Bedrock models allowed? | Not prohibited. But see strategy note below. | Medium — **UNVERIFIED by explicit statement** |
| Can I use existing code / OSS libraries? | Libraries yes (universal practice). But the **application must be original and not previously published** — so you cannot submit an existing repo of yours, and you should start a fresh public repo dated inside the submission window. | High on the rule, Medium on the library reading |
| Teams? | The UI shows "Project team" and the rules say "each winning project team participant" receives a certificate — so teams appear permitted, with **one entry per person**. | Medium — **UNVERIFIED**, no explicit team-size rule published |
| Prohibited use cases | Only the general warranties: nothing illegal, infringing, offensive/disparaging, or harmful to others or to AWS's reputation. No technology blacklist. | High |
| Deployment requirement | "Live on AWS." No specific service mandated — Amplify, App Runner, ECS, Lambda+API GW, EC2 all qualify. | High |

**Strategy note on models:** nothing forces you to use Bedrock. But 25% of your score is Technical Innovation and the panel is four AWS Solutions Architects. Using Bedrock + AgentCore is not rule-compliance, it is **score optimisation**. Using OpenAI's API for the reasoning core in an AWS hackathon is a self-inflicted wound.

### The coding-agent requirement, precisely

The canonical path is the **Agent Toolkit for AWS / AWS MCP Server** — a managed remote MCP endpoint that gives an agent authenticated access to 300+ AWS services, with CloudWatch metrics and IAM-based access controls. It supports Claude Code via plugin.

**Proof of connection — what to actually capture.** The rules don't define an accepted artifact format, so over-supply it (this is cheap insurance on a pass/fail gate):
1. Screenshot of your MCP config showing the AWS MCP server registered in Claude Code.
2. Screenshot of a session where the agent reads/creates real AWS resources.
3. **CloudWatch metrics/logs showing MCP server invocations from your account** — this is the strongest artifact because it is server-side evidence, not a screenshot you could fake.
4. CloudTrail entries for the IAM role the agent assumed.
5. A committed `.mcp.json` / plugin config in the public repo.

**UNVERIFIED:** whether AWS requires a specific proof format, and whether a console-native "connected agent" indicator exists. The Agent Toolkit docs describe no visual badge. Post the question on the hackathon **Discussion** tab — a public answer both de-risks you and earns visibility with judges.

### Field intelligence (this is the part nobody else does)

580 participants registered as of today, and the **Projects tab is public**. The ten most recent submissions are: a climate/EO intelligence platform, a property-valuation engine, an agentic Kubernetes IDE, a Socratic electronics-lab tutor, an ASL hand-sign detector, a scope-drift detector for freelancers, an Indian government-scheme eligibility finder, a generic "AI for everyone" platform, an empty S3 static site, and a border-monitoring video platform.

Read that honestly: **the field is not 500 elite engineers.** It is a normal open hackathon — a long tail of thin projects, a handful of serious ones, and several entries that will fail the ship gate outright. Your competition for a top-5 slot is realistically **20–40 genuinely strong submissions**, not 580.

Two more signals on what AWS rewards. In the recent [10,000 AIdeas competition](https://builder.aws.com/content/3D5gTWIjP2zvKncBZBCs849xRqn/aws-10000-aideas-competition-meet-the-winners) — same five tracks, near-identical criteria — a winner was **NeuroVoice**, a multimodal Parkinson's screening tool. The Amazon Nova hackathon's stated lesson was that "projects that solve real problems, demonstrate clear reasoning flows, and use Nova models meaningfully tend to perform better than generic chatbot or demo-only applications," and a winner was **EcoLafaek**, waste management in Timor-Leste using Bedrock Nova-Pro + AgentCore to autonomously chain tools.

**The pattern: AWS rewards vertical, legible, autonomous projects with a named beneficiary and a measurable outcome. It does not reward abstract developer control planes.** Hold that thought — it is fatal to two of your three ideas.

---

## SECTION 2 — MARKET LANDSCAPE (brutally honest)

You asked me not to claim empty space without checking. Here is what I found, and most of it is bad news for your current ideas.

### 2.1 AI agent observability / evaluation — **saturated and well-capitalised**

Six platforms anchor the category in 2026: **LangSmith, Langfuse, Arize Phoenix, Helicone, Datadog LLM Observability, Honeycomb**, plus **Braintrust**, which raised an **$80M Series B at an $800M valuation in Feb 2026** and treats evaluation as a first-class citizen alongside traces. Langfuse is MIT-licensed and self-hostable in minutes; pricing starts around $29/mo. ([MarkTechPost comparison](https://www.marktechpost.com/2026/08/09/top-llm-observability-and-evaluation-platforms-in-2026-langfuse-langsmith-braintrust-arize-and-more-compared/), [Laminar rankings](https://laminar.sh/article/top-6-agent-observability-platforms))

**What they do:** traces, spans, token accounting, cost per run, evals (LLM-as-judge + code), datasets, regression testing, dashboards, alerting.
**What they don't do:** verify that a *business* outcome in a third-party system actually occurred.
**Why customers use them:** they're free/cheap to start, framework-native, and already installed.
**Gap remaining:** thin. Anything you build here is a feature on someone's roadmap.

### 2.2 LLM / AI gateways and budget enforcement — **consolidated, and partly dead**

- **Portkey** — budgets, rate limits, semantic caching, cost tracking in one control plane. **Acquired by Palo Alto Networks, closed 29 May 2026**; now the AI Gateway inside Prisma AIRS.
- **LiteLLM** — open source, virtual keys with configurable per-team monthly budgets, 100+ providers.
- **Helicone** — **acquired by Mintlify in 2026, now in maintenance mode.**
- Kong AI Gateway, Zuplo, OpenRouter, Cloudflare AI Gateway all ship budgets/limits.

([Zuplo buyer's guide](https://zuplo.com/learning-center/best-ai-gateway-buyers-guide), [Portkey vs LiteLLM](https://klymentiev.com/blog/llm-gateway-guide))

**Read the acquisitions carefully.** Portkey going to Palo Alto and Helicone going to Mintlify is the market telling you this layer is not a standalone business — it gets absorbed into security or docs platforms. That is a direct, evidence-based refutation of SaaSGuard's thesis.

### 2.3 AWS-native alternatives — **this is the one that kills SaaSGuard**

Amazon Bedrock AgentCore now ships, natively, the majority of what SaaSGuard and Outcome Guard propose:

| AgentCore component | Status | What it already does |
|---|---|---|
| **Policy** | **GA 3 Mar 2026** | Intercepts tool calls in real time. Policies written in plain language, compiled to **Cedar**. Checks who is calling, which tool, and what input, before Gateway lets the tool run. Dev/compliance/security can author and audit rules without code. |
| **Evaluations** | **GA 31 Mar 2026** (preview Dec 2025) | **13 built-in evaluators** incl. helpfulness, tool selection, accuracy; custom model-based scorers; continuous monitoring on live traffic; unified CloudWatch dashboard. |
| **Observability** | GA | Built-in metrics for Runtime, Memory, Gateway, built-in tools and Identity; CloudWatch + CloudTrail. |
| **Gateway** | GA | Unified MCP interface, auth, routing, protocol translation to Lambda/OpenAPI/Smithy targets. |
| **Identity** | GA | Custom claims, multi-tenant auth rules, IdP integration. |
| **Browser / Code Interpreter** | GA | Managed headless browser and sandbox, $0.0895/vCPU-hr + $0.00945/GB-hr. |

([AgentCore Policy + Evaluations announcement](https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-bedrock-agentcore-policy-evaluations-preview), [AgentCore docs](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html), [Cedar policy review](https://clawaws.com/blog/agentcore-policy-review/), [pricing](https://aws.amazon.com/bedrock/agentcore/pricing/))

**Sit with this for a second.** You are proposing, to a panel of four AWS Solutions Architects, a policy-enforcement-plus-evaluation control plane for agents — six months after AWS shipped exactly that as two GA services. These are the five people on earth most likely to recognise it instantly. That is not a small risk; it is the most likely single cause of a low Technical Innovation & Originality score.

The one thing AgentCore genuinely does **not** do is enforce **spend budgets** — Policy governs behaviour, Evaluations governs quality, neither enforces a dollar ceiling. That is a real gap, but it is a *narrow* gap, it is a thing LiteLLM does for free, and it is obviously on a roadmap.

### 2.4 Business process / outcome observability — **enterprise-owned**

- **Celonis** — process mining, marketplace Process Connectors for Order-to-Cash and Purchase-to-Pay, 600+ teams on the SAP extractor. In 2025–26 they shipped a **Context Model**, an **Agent Toolkit built on MCP**, and an **Orchestration Engine** coordinating humans, automations and AI agents in real time, with agents designed to *resolve process exceptions instantly*. Entry pricing $150k+/yr, licensed per process domain. ([SiliconANGLE](https://siliconangle.com/2026/02/05/celonis-process-intelligence-turns-enterprise-ai-into-roi-celosphere/), [ERP Research](https://www.erpresearch.com/erp-add-ons/process-mining/celonis))
- **Camunda / Temporal** — durable execution, compensation, retries, SLAs. Temporal in particular makes "the workflow always eventually completes" a solved primitive.
- **Datadog / Dynatrace / Splunk** — SLOs, synthetic monitoring, business-outcome dashboards.

**What they don't do:** cheap, self-serve, cross-SaaS outcome contracts for a mid-market company. **Gap:** real, but the mid-market's actual answer is "write a reconciliation cron job," and that is a genuinely adequate answer.

### 2.5 The webhook/silent-failure niche specifically — **real problem, commoditised solution**

The failure mode you describe in OutcomeOS is well documented: Shopify will **remove a webhook subscription entirely** after persistent endpoint failures, and events during the gap are permanently lost; orders pass through Stripe without the store updating status for days. ([EventDock](https://eventdock.app/blog/shopify-webhook-reliability-orders-missing), [Shopify community](https://community.shopify.com/t/how-to-reconcile-orders-in-case-of-missed-webhooks/274830))

But Shopify's own documentation and every practitioner guide converge on the same fix: **ACK in <1s, process async, use idempotency keys, run a periodic reconciliation job.** Hookdeck, Svix and EventDock sell the infrastructure version. This is a one-engineer-day problem with a well-known answer, which is why nobody has built a $150k/yr product around it.

### 2.6 Agent-readiness / agentic commerce — **exploded in the last 6 months**

I went looking for whitespace here and found a stampede:
- **Cloudflare launched an "Agent Readiness score"** for any site. ([Cloudflare blog](https://blog.cloudflare.com/agent-readiness/))
- **Shopify** ships a public agentic-readiness scanner at shopify.com/agentic-readiness.
- **Aido Lighthouse** already "watches a real agent attempt discovery, add to cart, and checkout on your site in real time."
- Plus StartupHub.ai's Agent Readiness scanner (50+ signals, 6 dimensions), Shopware's scanner, isagentready.com (70 checkpoints), Invisible Technologies' 2-week readiness engagements.
- Infrastructure layer funded: **Basis Theory $33M Series B**, **Skyfire $9.5M**, **Nekuda $5M seed (Amex + Visa Ventures)**, **Rye**, **ShopAgentic €1.9M pre-seed (Jun 2026)**.
- Identity is **solved by the networks**: **Visa Trusted Agent Protocol**, announced 14 Oct 2025 with Adyen, Checkout.com, Cyber­Source, Fiserv, Microsoft, Nuvei, Shopify, Stripe, Worldpay; built on **RFC 9421 HTTP Message Signatures + Cloudflare Web Bot Auth**, Ed25519 verified against a Visa-operated directory. Mastercard put it in Agent Pay; Amex committed. ([Cloudflare](https://blog.cloudflare.com/secure-agentic-commerce/), [Visa Developer](https://developer.visa.com/capabilities/trusted-agent-protocol))

**Conclusion: "score my site for agent readiness" and "verify agent identity" are both closed.** Do not build either. But hold on to one finding from this research — it becomes the winner.

### 2.7 Web accessibility — **crowded at the top, structurally broken in the middle**

- Top five vendors — **Level Access, Siteimprove, AudioEye, Deque, UserWay** — hold ~45% of 2025 revenue. Deque ~$80–100M, Level Access $60–80M, Siteimprove $50–70M, AudioEye $30–40M. Market ~$1.3B by 2031, 8.9% CAGR.
- **Deque axe DevTools has User Flow Analysis**; **Evinced has Web Flow Analyzer** — record a journey of any length, get one deduplicated report, aimed squarely at e-commerce checkout and SPA flows.
- **TestParty** already does remediation-first code-level auto-fix delivered as **GitHub pull requests**, with Shopify and GitHub integrations.
- **Overlays are discredited**: the **FTC fined accessiBe $1M** for overstating overlay efficacy, and enterprises now demand transparent accuracy metrics.

So: scanning is solved. Flow recording is solved. Auto-fix PRs exist. **Do not pitch any of those as novel.**

What is *structurally* unsolved, and confirmed by every source I read:
- **Automated tools detect only ~20–40% of WCAG issues** (WAVE 30%, best-in-class SortSite 40%); only ~30% of WCAG success criteria are meaningfully machine-testable; roughly half of WCAG's 87 criteria require human judgement.
- Automation is "weak at judging **whether screen reader users can understand tasks**, whether focus movement matches intent, and whether the journey remains usable."
- The honest industry position: *"User testing with people with disability is the only way to validate that the product is actually usable, not just technically conformant"* — recommended specifically for **authentication, payment and application flows**.
([Level Access](https://www.levelaccess.com/blog/automated-accessibility-testing-a-practical-guide-to-wcag-coverage/), [accessibility.build](https://accessibility.build/guides/automated-vs-manual-accessibility-testing), [Deque](https://www.deque.com/blog/scripted-user-flow-testing-vs-end-to-end-testing-for-accessibility/))

**That is the gap: the entire industry reports violations, and nobody reports whether the task can be completed.**

### 2.8 The convergence nobody is selling yet

Three independent findings that, put together, are the strategic insight of this whole document:

1. **CHI 2026, UC Berkeley + University of Michigan (A11y-CUA dataset).** Claude Sonnet 4.5 on 60 everyday desktop/web tasks under three conditions — standard, keyboard-only (simulating screen-reader workflows), and 150% magnified viewport. **Agent task success fell from 78.33% to 42%** under degraded-accessibility conditions. Backed by 40+ hours of comparison data from 16 sighted, blind and low-vision users on the same tasks.
2. **WebAIM Million, Feb 2026:** 95.9% of home pages have detectable WCAG failures, **56.1 errors per page** (up 10.1% YoY), with 51% missing form labels, 46.3% empty links, **30.6% empty buttons** — precisely the elements a checkout depends on.
3. **AI agents are now 57.2% of HTML traffic** ([SEJ](https://www.searchenginejournal.com/the-accessibility-tree-is-how-ai-agents-read-your-site-its-breaking/578171/)), and merchants who blocked AI crawlers saw referral traffic fall 18% MoM.

**The same broken markup that locks out a blind shopper locks out ChatGPT's shopping agent.** Accessibility stopped being a compliance cost line in 2026 and became a revenue-channel dependency — and I could not find a single vendor selling it that way. Accessibility vendors sell compliance. Agent-readiness scanners sell SEO-flavoured scores. Nobody sells **"prove a real transaction can be completed, by a human using assistive tech and by a machine agent, and fix it when it can't."**

Money on both sides of that: **55% of UK online shoppers with disabilities have abandoned purchases due to poor accessibility**; the Click-Away Pound puts 4.3M disabled UK shoppers and **£17.1bn** of spend walking away; 62% of business leaders believe customers have abandoned transactions over accessibility. On the stick side, the **European Accessibility Act** has been enforceable since 28 Jun 2025 in all 27 member states; **in June 2026 a French court ordered Carrefour to make its e-commerce site and app fully accessible within six months**; Norway's HelsaMi is accruing **NOK 50,000/day with no ceiling**; statutory maxima run from €60k (Ireland) to ~€1.26M or 5% of turnover (Hungary). ([Level Access EAA](https://www.levelaccess.com/compliance-overview/european-accessibility-act-eaa/), [enforcement review](https://auditsu.com/resources/eaa-enforcement-2026), [Click-Away Pound](https://www.wearetenet.com/blog/web-accessibility-statistics))

---

## SECTION 3 — YOUR EXISTING IDEAS

### 3.1 SaaSGuard AI — **kill it**

**Strengths:** the runaway-agent-cost problem is real and visceral; easy to demo; you already suspected the flaw, which is good instinct.

**Weaknesses, in order of severity:**
1. **AWS shipped it.** AgentCore Policy (GA Mar 2026) is a real-time tool-call interceptor with Cedar rules. That is the enforcement half.
2. **The market consolidated.** Portkey → Palo Alto (May 2026). Helicone → Mintlify, maintenance mode. The standalone-gateway thesis was tested by the market and lost.
3. **It's free elsewhere.** LiteLLM gives per-key monthly budgets in OSS.
4. **It's a proxy.** Architecturally it is an API Gateway, a DynamoDB counter and a kill switch. Four AWS SAs will see that in ten seconds.
5. **$99–$499/mo is a bad business.** You'd be selling a cost-control product to companies whose costs are small enough that they can't justify $499/mo; the ones who can justify it have already bought Datadog or built it.

**Differentiation:** none that survives contact with AgentCore Policy + LiteLLM.
**Technical difficulty:** low. **Commercial potential:** low. **Hackathon potential:** low-to-moderate; it would score badly on Originality and Market Impact, the two criteria it most needs.
**Fatal flaw:** *it is a thin wrapper around a GA AWS service, presented to AWS.*

### 3.2 OutcomeOS — **strong thesis, wrong product**

**Strengths:** the underlying observation is genuinely correct and genuinely underserved — component health ≠ business outcome, and every API in a chain can return 200 while the customer gets nothing. The "outcome contract" abstraction is a good idea and I'd keep the *word*. Your worked example (11 orders, $3,840 at risk, replay through fallback) is a good demo beat.

**Weaknesses:**
1. **It needs integrations to exist at all.** Shopify + Stripe + Salesforce + HubSpot + Zendesk + Slack + Gmail. In 12 days you will build mocks, and judges who know these APIs will see mocks. The value of the product is *precisely* the breadth you cannot build.
2. **The demo requires a fake company.** Your evidence trail is synthetic, so the Market Impact claim is unevidenced.
3. **The mid-market's real answer is a reconciliation cron.** Adequate, free, understood.
4. **The enterprise's real answer is Celonis** — with an MCP Agent Toolkit and an Orchestration Engine that already resolves process exceptions with agents.
5. **Temporal already guarantees this class of problem away** for workflows you control.
6. **Autonomous recovery is the scariest possible sell.** "Our AI will re-run your refunds" is a procurement nightmare; you'd ship recommend-only, which collapses the differentiation back to alerting.

**Differentiation:** moderate in concept, weak in defensibility — the moat would be integration breadth, which is capital, not cleverness.
**Technical difficulty:** high (real), low (demoable). **Commercial potential:** moderate, long sales cycle, 18-month build. **Hackathon potential:** moderate — good story, but Implementation Quality will be visibly shallow.
**Fatal flaw:** *the product's entire value is integration coverage you cannot build in 12 days, so the demo is necessarily a mock of the thing that matters.*

**And a specific red flag for you:** the canonical OutcomeOS example is Shopify → payment → fraud check → fulfilment → confirmation. That is GoKwik's exact problem domain. Building and publicly publishing this, with a Startup lane pitch, is the highest-IP-risk option on the table.

### 3.3 Outcome Guard — **the weakest of the three, despite feeling like the strongest**

Combining two ideas does not average their weaknesses; it inherits both.

**Strengths:** the "AI ROI Firewall" framing is genuinely memorable, and "is the expected business value of continuing greater than the expected additional cost?" is a sharp sentence.

**Weaknesses:**
1. **It inherits the AgentCore collision** (Policy + Evaluations) *and* the OutcomeOS integration problem.
2. **The core mechanic is unfalsifiable in a demo.** "Expected customer value: $85" — where does that number come from? A judge asks once and the whole ROI framing collapses into a hard-coded constant. This is the single most dangerous thing in your deck, because the most quotable part of the pitch is the least defensible part.
3. **Scope is 3 products.** Cost governance + quality eval + outcome verification + autonomous recovery, in 12 days, solo. Implementation Quality (25%) will suffer visibly.
4. **Your dashboard mockup is the anti-pattern.** "1,284 AI tasks / 95.9% outcome success / $84.20 spend" is a dashboard, and you correctly told me not to build a dashboard.
5. **Positioning is abstract.** "The control plane for economically reliable AI agents" is a sentence a judge cannot picture. Compare to "Parkinson's screening from your voice."

**Differentiation:** low. **Commercial potential:** low near-term. **Hackathon potential:** low-moderate.
**Fatal flaw:** *its headline metric (expected business value) is a number you have to invent, and inventing it is visible.*

### 3.4 Verdict on all three

**Reject all three.** Not because the thinking is bad — the "outcome, not activity" instinct is the best thing in your brief and I'm going to reuse it — but because all three land in the single most crowded, best-funded, most AWS-colonised corner of the 2026 market, and all three are abstract infrastructure that a mixed panel cannot picture in 60 seconds.

**What I'm keeping from your work:** the core abstraction — *verify the outcome, not the status code* — and applying it to a domain where the outcome is (a) observable without integrations, (b) legally consequential, and (c) countable in money.

---

## SECTION 4 — NEW IDEAS

Twenty, generated against the filter: expensive + frequent + underserved + fragmented existing tooling + autonomous action is genuinely valuable + ROI is countable + AWS gives a real edge + demoable without fake data. No chatbots, no "chat with your data", no LLM wrappers.

| # | Idea | One line | Why now (2026–30) | Verdict |
|---|---|---|---|---|
| N1 | **Buyable** | Proves a revenue-critical journey can actually be *completed* — by a keyboard/screen-reader user, by an AI shopping agent, and by a baseline user — then fixes what blocks it and re-runs to prove the fix | EAA enforcement + agents are 57% of HTML traffic + agent task success collapses 78%→42% on inaccessible sites | **SHORTLIST — winner** |
| N2 | **LoopClose** | Closes the referral loop in healthcare: verifies the patient actually reached the specialist, chases the ones who didn't | Referral leakage is 25–50%; India's health-system digitisation (ABDM) makes the data addressable | **SHORTLIST** |
| N3 | **HeatShield** | Heat-risk work scheduling for outdoor labour — predicts wet-bulb danger per worksite and reschedules shifts | 2026 heat records; India has 100M+ outdoor workers; climate resilience is an AWS Social Impact focus area | **SHORTLIST** |
| N4 | **ConsentLedger** | Agentic DSAR/erasure fulfilment across a company's data estate, with proof-of-erasure | India DPDP: Consent Manager framework live 13 Nov 2026, hard enforcement May 2027, penalties to ₹250 crore; 71% of Indian enterprises have limited understanding of the Act | **SHORTLIST** |
| N5 | **Deadman** | Verifies that scheduled jobs produced their *business artifact*, not just exit code 0 (the salvageable core of OutcomeOS, scoped to one system) | Agent-written cron/ETL is proliferating | **SHORTLIST** |
| N6 | AI-code blame ledger | Attributes production incidents back to the AI agent, prompt and model that wrote the line | 81% of tech leaders report more prod issues from AI code; AI code causes 1 in 5 breaches | Crowded (Sonar, CodeRabbit, CloudBees, Augment) |
| N7 | Dependency EOL/licence drift agent | Autonomously PRs upgrades off EOL and licence-incompatible deps | Cyber Resilience Act; SBOM mandates | Dependabot/Renovate/Snyk own it |
| N8 | Warranty-claim recovery for manufacturers | Finds under-claimed supplier warranty recoveries from service records | Margin pressure | Data access impossible in 12 days |
| N9 | Insurance denial appeal agent | Drafts and files clinical appeals with citations | US denial rates | Crowded (Claimable, Counterforce); US-health-centric |
| N10 | Pharmacy shortage substitution agent | Real-time therapeutic substitution when a drug is out of stock | Persistent shortages | Clinical liability; needs licensed data |
| N11 | School dropout early-warning + intervention | Predicts and then *acts* — schedules counsellor contact, verifies it happened | Education is an AWS Social Impact focus area | Needs real school data; risks being a dashboard |
| N12 | Municipal water-loss detection from billing | Finds non-revenue water from meter/billing anomalies | 40%+ NRW in Indian cities | Great impact, weak demo drama |
| N13 | Grant/tender eligibility agent | Reads a tender, checks a bidder against every clause, produces a go/no-go with evidence | Public procurement digitisation | Document-QA smell; hard to make agentic |
| N14 | Cold-chain excursion agent | Detects vaccine/temperature excursions and autonomously reroutes | Health + climate | IoT hardware dependency |
| N15 | Emergency-call multilingual triage | Triages 108/112 calls across Indian languages | Voice models matured | Cannot deploy publicly; ethical risk |
| N16 | Construction RFI/change-order agent | Turns RFIs into priced change orders with drawing citations | Labour shortage | Needs BIM/drawing corpus |
| N17 | Food-safety vision compliance | Camera agent audits kitchen compliance continuously | FSSAI enforcement | Privacy; hardware |
| N18 | Document-accessibility at scale | Remediates PDF/Office accessibility for public bodies | EAA covers documents | Real, but a subset of N1 — fold it in |
| N19 | Agent blast-radius pre-mortem | Simulates a tool call's downstream effect before executing | Agents act on prod systems | Collides with AgentCore Policy |
| N20 | Carbon-aware workload scheduler | Shifts batch compute to low-carbon regions/hours | CSRD reporting | AWS already ships a Customer Carbon Footprint Tool + region guidance |

### Shortlist of 5

**N1 Buyable**, **N2 LoopClose**, **N3 HeatShield**, **N4 ConsentLedger**, **N5 Deadman**.

---

## SECTION 5 — SCORING MATRIX

0–10. **Criteria 23 and 24 are risks: lower is better.** Criterion 25 is my judgement, not an average — reasoning follows the table.

| # | Criterion | SaaSGuard | OutcomeOS | Outcome Guard | **Buyable** | LoopClose | HeatShield | ConsentLedger | Deadman |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Real-world pain | 6 | 8 | 7 | **9** | 9 | 8 | 8 | 7 |
| 2 | Problem size | 7 | 8 | 7 | **8** | 9 | 8 | 8 | 7 |
| 3 | Frequency | 8 | 7 | 7 | **9** | 8 | 8 | 7 | 8 |
| 4 | Willingness to pay | 4 | 6 | 5 | **8** | 7 | 4 | 8 | 5 |
| 5 | ROI clarity | 6 | 8 | 5 | **9** | 8 | 5 | 8 | 7 |
| 6 | Market size | 6 | 7 | 6 | **7** | 7 | 5 | 7 | 6 |
| 7 | Novelty | 2 | 5 | 3 | **8** | 6 | 6 | 5 | 4 |
| 8 | Competitive whitespace | 2 | 4 | 3 | **7** | 6 | 7 | 5 | 4 |
| 9 | Defensibility | 2 | 4 | 3 | **6** | 5 | 4 | 4 | 3 |
| 10 | Technical innovation | 3 | 6 | 5 | **8** | 6 | 6 | 5 | 5 |
| 11 | AI necessity | 4 | 6 | 5 | **9** | 7 | 6 | 6 | 4 |
| 12 | Agentic capability | 4 | 7 | 6 | **9** | 8 | 7 | 7 | 6 |
| 13 | AWS integration | 6 | 7 | 7 | **9** | 7 | 8 | 7 | 7 |
| 14 | Hackathon judging fit | 3 | 5 | 4 | **9** | 8 | 8 | 6 | 5 |
| 15 | Demo wow factor | 4 | 6 | 5 | **9** | 7 | 7 | 4 | 6 |
| 16 | Storytelling | 4 | 7 | 6 | **9** | 9 | 9 | 6 | 6 |
| 17 | Ease of understanding | 7 | 6 | 4 | **9** | 8 | 9 | 7 | 7 |
| 18 | Public deployment feasibility | 8 | 6 | 6 | **8** | 6 | 8 | 7 | 8 |
| 19 | **MVP feasible in 12 days** | 8 | 3 | 2 | **8** | 4 | 7 | 6 | 7 |
| 20 | Expansion potential | 4 | 7 | 6 | **8** | 7 | 6 | 7 | 6 |
| 21 | Startup potential | 3 | 6 | 4 | **7** | 6 | 4 | 7 | 5 |
| 22 | Social/business impact | 4 | 5 | 5 | **9** | 10 | 9 | 5 | 4 |
| 23 | *Risk: looks like a clone* ↓ | 9 | 6 | 8 | **3** | 4 | 4 | 6 | 7 |
| 24 | *Risk: AWS already solves it* ↓ | 10 | 7 | 9 | **2** | 2 | 3 | 4 | 6 |
| 25 | **Overall winner potential** | **2** | **4** | **3** | **9** | **6** | **6** | **5** | **4** |

### Reasoning, not arithmetic

- **SaaSGuard scores 2 overall** despite decent feasibility because criteria 7, 8, 23 and 24 are not independent of the others — they are *gates*. A submission that an AWS SA can map onto a GA AWS service in ten seconds cannot win Technical Innovation & Originality, and that is 25% of the score. Feasibility cannot compensate.
- **OutcomeOS scores 4** — its pain and ROI scores are the second-highest in the table, and it still loses, entirely on criterion 19. A product whose value *is* integration breadth cannot be honestly demonstrated in 12 days. Under a 6-month timeline this would score 6–7.
- **Outcome Guard scores 3**, below OutcomeOS, because merging made it *less* buildable and *more* collidable with AgentCore, while adding an unfalsifiable headline metric.
- **Buyable scores 9** not because any single criterion is a 10, but because it is the only candidate with **no score below 6** and low marks on both risk criteria. It is the only idea where the demo, the market story, the AWS architecture and the 12-day scope all point the same direction.
- **LoopClose has the highest social impact (10) and still loses** — because criterion 19 is a 4. Real patient-referral data is inaccessible to a solo builder in 12 days, and a health demo on synthetic data reads as hollow to judges.
- **HeatShield is the strongest Social Good alternative** and genuinely eligible for AWS Social Impact Credits. It loses on willingness to pay (4) and startup potential (4) — you asked for an idea that is both a contender and a business, and HeatShield is only the first.
- **ConsentLedger has the best pure-business case** (willingness to pay 8, ROI 8, timing pinned to Nov 2026 / May 2027 DPDP deadlines) and the worst demo (4). Compliance software does not produce a 60-second moment.

---

## SECTION 6 — TOP 3, IN DEPTH

### 🥇 #1 — BUYABLE

> **"Every business tests whether its site *works*. Nobody tests whether its customers can actually *finish*."**

**Problem.** A revenue journey — checkout, signup, booking, application — can be technically healthy and still be impossible to complete for a large share of the people and machines trying. Two constituencies, one root cause:
- **Humans using assistive technology.** 95.9% of home pages have WCAG failures, averaging 56.1 errors per page, with 51% missing form labels and 30.6% empty buttons — the exact controls a checkout depends on. 55% of UK online shoppers with disabilities have abandoned purchases because of it; the Click-Away Pound puts £17.1bn of spend walking away.
- **AI agents.** Agents are now 57.2% of HTML traffic. The CHI 2026 A11y-CUA study (UC Berkeley + Michigan) measured agent task success falling **from 78.33% to 42%** when the accessibility tree is degraded — because agents read the same accessibility tree screen readers do.

Meanwhile the legal side stopped being theoretical: EAA enforceable in all 27 member states since June 2025; **Carrefour ordered by a French court in June 2026** to fix its site and app within six months; Norway's HelsaMi accruing NOK 50,000/day with no ceiling; maxima up to ~€1.26M or 5% of turnover.

**Target user.** Head of E-commerce / VP Engineering / QA lead at a mid-market to enterprise online retailer, bank, airline, or public body with EU or UK exposure. **User:** the engineer who has to fix it. **Economic buyer:** whoever owns the compliance risk or the conversion rate — usually the same VP.

**Existing alternatives, and exactly what they leave on the table.**

| They do | They don't |
|---|---|
| **Deque axe DevTools User Flow Analysis** — record a human-driven journey, one deduplicated violation report | Does not attempt the task itself; does not answer "could it be completed?"; does not fix |
| **Evinced Web Flow Analyzer** — record a journey, consolidated screen-reader/keyboard findings | Same: reports violations on a journey a sighted human already completed |
| **TestParty** — auto-fix WCAG violations as GitHub PRs | Fixes *rule violations*, not *journey blockers*; no completion proof; no re-verification loop |
| **AudioEye / Level Access / UserWay** — scan + overlay + human audit services | Overlays discredited (FTC's $1M accessiBe fine); audits are point-in-time and expensive |
| **Cloudflare Agent Readiness / Shopify agentic-readiness scanner / isagentready** | Static markup scores. isagentready says it plainly: *"These static signals do not prove how an agent understands a page or completes a task."* |
| **Aido Lighthouse** — watches a live agent attempt checkout | Closest competitor. Diagnostic only: no assistive-tech persona, no code-level fix, no re-verification, no conformance evidence |

**The gap, stated precisely.** Every tool in the market emits **violations or scores**. None emits a **task-completion verdict**, and none **closes the loop** from failed task → located blocker → generated patch → re-run → proof. And nobody has connected the two constituencies: *the markup that locks out a blind shopper is the markup that locks out ChatGPT's agent.* One fix, two revenue channels, one legal defence.

**The product.**
1. Point it at a live URL and state a goal in plain English: *"Buy the cheapest blue running shoe in size 9 and reach the order confirmation."*
2. It runs that goal three times in parallel, as three **personas**, each a hard constraint on how the agent may perceive and act:
   - **Baseline** — full DOM + vision.
   - **Assistive** — accessibility tree only, keyboard-only navigation, focus order enforced, announcements as a screen reader would emit them.
   - **Agent** — accessibility tree + semantic/structured data only, no vision, exactly what a shopping agent sees.
3. It reports one headline number: **Journey Completion Rate (JCR)** per persona. Not 47 violations. `Baseline 1/1 · Assistive 0/1 · Agent 0/1`.
4. On failure it captures the **exact blocking node** at the exact step, with the accessibility-tree snapshot and the agent's own reasoning transcript ("focus moved to an element with no accessible name; nothing was announced; I could not determine how to proceed").
5. A Bedrock agent reads the repo, generates a **minimal patch**, opens a PR, and **re-runs the same journey against the patched build** — the fix is only reported as fixed when the JCR moves.
6. Every run writes a timestamped, immutable **evidence bundle** to S3: journey video, a11y-tree diffs, WCAG success-criteria mapping, patch, and the passing re-run. That bundle is the artifact your lawyer wants under EAA.

**Why AI?** Because you cannot enumerate "can a human complete this?" as a rule. 70% of WCAG criteria need judgement; the industry's own honest position is that only real-user testing validates usability. An LLM reasoning over an accessibility tree, deciding what to do next and reporting *why it got stuck*, is the first thing that has ever approximated that at machine cost. This is the rare product where the LLM is not decoration — remove it and the product cannot exist.

**Why agents?** Because the test *is* an agent completing a multi-step task under constraint, and the fix *is* an agent editing a repo and re-verifying. Two genuinely autonomous loops, not a chat box.

**Why AWS?** **Bedrock AgentCore Browser** is the exact right primitive and almost nobody in this hackathon will use it — a managed, sandboxed, session-isolated headless browser billed at $0.0895/vCPU-hr with profile persistence, so each persona gets a clean isolated session. Pair it with Step Functions Map for parallel personas, Bedrock (Claude via Bedrock) for reasoning and patch generation, S3 Object Lock for tamper-evident evidence, and you have an architecture a Solutions Architect will nod along to.

**Business model.** $499/mo for 5 monitored journeys with weekly runs; $2,500/mo for 25 journeys, daily runs, CI gate and evidence export; enterprise from $30k/yr with SSO and audit support. Benchmarks: Deque is a $80–100M business, Level Access $60–80M, market to $1.3B by 2031. **ROI line:** "one avoided EAA action, or 0.3% of recovered checkout conversion, pays for a year."

**Hackathon fit.** Commercial Potential + Startup. Scores on all four criteria simultaneously — see Section 12.

**Moat.** Not the scanner (commodity). The moat is the **corpus of journey traces** — every run teaches the system which accessibility-tree shapes actually block completion versus which merely violate a rule. That is proprietary data that compounds, and it is exactly what the rule-based incumbents do not have.

**Biggest risk.** Deque and Evinced are one product decision away. Evinced already claims to find screen-reader and keyboard issues "that would otherwise require manual audit." Your defence is speed and framing, not technology.

---

### 🥈 #2 — LOOPCLOSE

**Problem.** A doctor refers a patient to a specialist. The referral is "sent." Whether the patient ever arrived is, in most systems, unknown. Referral leakage runs 25–50%; for oncology, cardiology and antenatal follow-up, a dropped referral is a health outcome, not a ticket. Every system in the chain reports success.

This is **your OutcomeOS thesis in the one domain where the outcome matters most and nobody has an integration monopoly.**

**Target user.** Hospital network / diagnostic chain / government health programme. **Economic buyer:** medical director or programme head.
**Alternatives.** Epic/Cerner referral modules (closed, enterprise-only), Health Gorilla, ReferralMD, manual call centres. In India, ABDM is digitising the rails but nothing closes the loop.
**Gap.** Nobody *acts* on the open loop — detects it, reasons about why (transport? cost? language? no slot?), and autonomously executes the right nudge in the right language on the right channel, then verifies attendance.
**Why AWS.** Bedrock for multilingual reasoning, Amazon Connect + Pinpoint for outbound voice/SMS, Step Functions for the chase-and-verify saga, HealthLake for FHIR.
**Hackathon fit.** Social Good / Health — and because you are in India, you satisfy the AWS Social Impact Credits rule that health applicants be based outside the US.
**Biggest risk — and why it's #2 not #1.** You cannot get real referral data in 12 days. A synthetic-data health demo reads as a mock-up, and Implementation Quality is 25%.

---

### 🥉 #3 — HEATSHIELD

**Problem.** Wet-bulb temperature, not air temperature, is what kills outdoor workers, and it is not on any weather app. India has 100M+ construction, delivery, agricultural and municipal workers with no per-site heat-risk signal and no rescheduling mechanism.
**Target user.** Construction firms, logistics fleets, municipal corporations, gig platforms. **Economic buyer:** EHS head (liability) or ops head (productivity loss).
**Alternatives.** Generic weather APIs; OSHA/NIOSH guidance PDFs; nothing that turns a forecast into a rescheduled shift roster.
**Gap.** The action layer. Everyone publishes heat indices; nobody reschedules the crew, notifies in the worker's language, and logs the duty-of-care evidence.
**Why AWS.** Bedrock for reasoning over roster + forecast constraints, Lambda + EventBridge Scheduler for the decision cadence, Location Service for site geocoding, open NASA POWER / IMD data — **all public, all real, no synthetic data**. Timestream for the heat series.
**Hackathon fit.** Social Good / Climate resilience — directly eligible for AWS Social Impact Credits.
**Biggest risk.** Willingness to pay is weak: the buyer is a cost centre, the beneficiary has no budget, and the strongest version depends on regulation that does not exist yet. Excellent hackathon project, mediocre startup.

---

## SECTION 7 — THE WINNER

# **BUYABLE**

**One line:** *Buyable proves that a real customer — using a screen reader, a keyboard, or an AI shopping agent — can actually complete your checkout, and fixes your code when they can't.*

No hedging. This is the one.

**Why it beats the other two shortlisted ideas.** LoopClose has more moral weight and HeatShield has a cleaner Social Good fit, but both fail the same test: in 12 days, neither can be demonstrated on real data against a real, live, third-party system. Buyable can be pointed at **any public website in the world, live, on stage** — including a judge's own. That single property converts Implementation Quality and Demo Wow from things you claim into things the judge verifies in eight seconds.

**Why it beats your three ideas.** Yours are all abstract control planes in the most saturated, most AWS-colonised segment of 2026, aimed at an imaginary customer, demoed on invented data. Buyable takes the *good* part of your thinking — verify the outcome, not the status code — and lands it where the outcome is directly observable, legally consequential, and countable in money, with no integrations required.

**Why it fits the published criteria, specifically.**
- *Technical Innovation & Originality (25%)* — constraint-based persona execution over accessibility trees plus a closed fix-and-re-verify loop is a genuinely new composition, and AgentCore Browser is a service almost no entrant will touch.
- *Implementation Quality (25%)* — it either completes the journey or it doesn't; the artifact is self-proving.
- *Community/Market Impact (25%)* — the rare project with a disability-inclusion story *and* a hard commercial ROI, both externally cited.
- *Creativity & Storytelling (25%)* — "the same broken button that locks out a blind shopper locks out ChatGPT" is a sentence a judge will repeat in the deliberation room. That is what wins panels.

**What I will not claim.** I cannot tell you this will win; 5 winners from a field whose serious tail I estimate at 20–40, judged partly by an AI scorer whose weighting I cannot inspect, is not predictable. What I can say from evidence: it is the only candidate that scores ≥6 on all 25 criteria, has the lowest combined risk on "looks like a clone" and "AWS already does this," and is the only one whose demo works on a stranger's website.

**Name alternatives** if Buyable feels too narrow: **Doorway**, **Gauntlet**, **Threshold**. Keep the metric name either way: **Journey Completion Rate**.

---

## SECTION 8 — THE MVP (12 days, solo, evenings + 2 weekends)

Budget realistically: ~10 evenings × 3h + 4 weekend days × 8h ≈ **62 working hours**. Scope to 45 and keep 17 for the submission write-up, the demo video and the ship-gate margin. The write-up is 25% of the score at Gate 1 — it is not overhead, it is a deliverable.

### MUST HAVE (this is the whole product)

1. **Journey definition** — a URL + a plain-English goal + an optional success assertion (`url matches /order/confirmed` or `page contains "Order confirmed"`). Stored in DynamoDB.
2. **Three persona runners** on AgentCore Browser:
   - `baseline` — DOM + screenshots.
   - `assistive` — **accessibility tree only, keyboard-only actions** (Tab/Shift-Tab/Enter/Space/arrows). No coordinate clicks. This constraint *is* the product; enforce it in the tool layer so the model physically cannot cheat.
   - `agent` — accessibility tree + JSON-LD/microdata only, no vision.
3. **Journey Completion Rate** per persona, plus **the step index where it broke**.
4. **Blocker localisation** — on failure, persist: the failing a11y-tree node (role, name, state, focusability), the DOM selector, a screenshot, and the model's own stuck-reasoning in its own words.
5. **Fix generation** — Bedrock reads the blocker + the relevant source file and emits a minimal unified diff with the WCAG success criterion cited.
6. **Re-verification** — apply the patch to a copy, re-run the *same* journey with the *same* persona, and report the JCR delta. **This loop is the differentiator; do not cut it.**
7. **Evidence bundle** to S3 — JSON + screenshots + the diff + before/after JCR, retrievable by a public permalink.
8. **A public web app** with: URL input, live run stream, three persona columns, the JCR headline, the blocker card, the diff, and the re-run result. Server-rendered enough that the AI scorer can read it without JS.
9. **One pre-seeded, always-available demo run** on a deliberately broken sample store *you host* — so the ship gate and the AI scorer never depend on a third party being up.

### SHOULD HAVE

- GitHub App that opens the PR for real (huge credibility; ~4h).
- Scheduled re-runs via EventBridge Scheduler, with regression alerts.
- WCAG success-criterion mapping table on each blocker.
- A public leaderboard of scanned well-known sites (careful: see Section 13 risk 7).

### NICE TO HAVE

- Screen-reader audio rendering of the announcement stream (very high demo drama, ~3h with Polly — genuinely consider promoting this).
- Multi-page crawl / journey auto-discovery.
- Cost-per-run display.

### DO NOT BUILD

- ❌ An analytics dashboard with sparklines. You told me not to; you were right.
- ❌ Auth / multi-tenancy / Cognito login walls. A login wall risks the ship gate.
- ❌ Billing, Stripe, pricing pages.
- ❌ A full WCAG rule engine — shell out to `axe-core` for the rule layer and spend your originality budget on the completion layer.
- ❌ Mobile app, browser extension, Figma plugin.
- ❌ Chat interface. The product is a verdict, not a conversation.
- ❌ Your own headless-browser infrastructure. Use AgentCore Browser; that *is* the AWS story.

### Day plan

| Days | Work |
|---|---|
| 1 (Sat 20) | Decide. Register on Builder Center. Connect Claude Code to the AWS MCP Server, **capture proof artifacts immediately**. Create public repo. |
| 2–3 | AgentCore Browser session + accessibility-tree extraction + the constrained keyboard-only tool surface. This is the hard part — do it first. |
| 4–5 | Persona runner loop with Bedrock; JCR + step-level failure capture. |
| 6 | Build the deliberately-broken demo store (3 real, subtle blockers: unlabelled icon button, div-as-button, focus trap in the address step). |
| 7–8 | Fix generation + patch application + re-verification loop. |
| 9 | Front end + S3 evidence bundle + public permalink. |
| 10 | Deploy properly (see Section 10). Harden the always-on demo run. Load/uptime check. |
| 11 | Record the demo. Write the Builder Center project page. |
| 12 (Thu 1 Oct) | Buffer. Submit with 24h to spare — **do not submit on 2 Oct.** |

---

## SECTION 9 — THE DEMO (75 seconds, shot-by-shot)

Record it. Do not do it live. Upload to YouTube unlisted *and* embed a GIF in the project page, because the Gate 1 AI scorer may not watch video.

| Time | What the judge sees | Audio / on-screen text |
|---|---|---|
| **0:00–0:08** | A clean online store. A cursor buys a jacket in four clicks. Green tick: **Order confirmed**. | "This store works. Their monitoring is all green. Conversion is fine." |
| **0:08–0:18** | Same store, same goal. Left panel: **live accessibility tree**, no screenshot. A focus ring tabs through elements. Announcements print as text. | "Now watch the same purchase, the way a screen-reader user experiences it — and the way ChatGPT's shopping agent experiences it. Both read the same accessibility tree." |
| **0:18–0:30** | Tab ring lands on the checkout button. Announcement prints: **`button, (no accessible name)`**. The agent tries twice, then stops. Red: **BLOCKED at step 4 of 6.** | *Agent transcript, on screen:* "Focus moved to an interactive element with no accessible name. Nothing was announced. I cannot determine how to proceed." |
| **0:30–0:40** | Headline metric snaps into place: **`Baseline 1/1 · Assistive 0/1 · Agent 0/1`**. Underneath: `Journey Completion Rate: 33%`. | "One line of markup. Not a warning. Not a score of 87. **Nobody using a screen reader, and no AI agent, can buy from this store.**" |
| **0:40–0:50** | Split screen. Left: the £17.1bn click-away figure and 55% abandonment. Right: the Carrefour ruling, June 2026. Then: **78% → 42%**, the Berkeley/Michigan agent-success collapse. | "That's £17.1 billion of disabled shoppers clicking away. That's a French court ordering Carrefour to fix exactly this. And that's AI agent task success falling from 78% to 42% on sites like it." |
| **0:50–1:03** | Buyable locates the node, opens **a real GitHub PR**: 1 file, +1 −1, `aria-label` added, WCAG 4.1.2 cited. PR title visible. | "Buyable finds the blocking node, writes the patch, cites the success criterion, and opens the pull request." |
| **1:03–1:15** | **It re-runs the same journey on the patched build.** Tab ring reaches the button. Announcement: **`Complete purchase, button`**. Enter. **Order confirmed.** Metric animates **33% → 100%**. | "Then it proves the fix — by completing the purchase it couldn't complete 60 seconds ago. **We don't report violations. We prove people can buy.**" |

**Closing frame (static, 3s):** the live URL, and the line *"Try it on your own site."*

**Why this beats a dashboard demo:** the judge watches a purchase fail, understands exactly why, watches money and law get attached to it, watches a machine fix it, and watches the purchase succeed. The metric moves on screen. There is nothing to take on trust.

---

## SECTION 10 — AWS ARCHITECTURE

Every service below earns its place; I have cut the ones that would only be logo decoration.

```
                                   ┌──────────────────────────────┐
   Public users ──── CloudFront ──▶│  S3  (static Next.js export) │
   AI scorer    ────────┬──────────└──────────────────────────────┘
                        │
                        ▼
              ┌───────────────────┐
              │   API Gateway     │  HTTP API, public read routes unauthenticated
              │  (+ WAF rate cap) │  so the ship-gate crawler always succeeds
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │  Lambda: control  │  create run, read run, stream status
              └─────────┬─────────┘
                        │ StartExecution
              ┌─────────▼──────────────────────────────────────────┐
              │            Step Functions  (Standard)              │
              │                                                    │
              │  [Plan journey]  ── Bedrock: goal → step plan      │
              │        │                                           │
              │  [Map: 3 personas, parallel, maxConcurrency 3]     │
              │    ├── baseline  ┐                                 │
              │    ├── assistive ├─▶ Lambda: PersonaRunner         │
              │    └── agent     ┘        │                        │
              │                           ▼                        │
              │              ┌────────────────────────────┐        │
              │              │ Bedrock AgentCore Browser  │        │
              │              │ isolated session / persona │        │
              │              │ a11y tree + keyboard tools │        │
              │              └────────────┬───────────────┘        │
              │                           │ loop: observe→decide→act
              │                           ▼                        │
              │                   Bedrock (Claude)                 │
              │                                                    │
              │  [Choice: any persona blocked?]                    │
              │        ├── no  ──▶ [Write evidence] ──▶ done       │
              │        └── yes ──▶ [Localise blocker]              │
              │                      │                             │
              │                   [Generate patch]  Bedrock        │
              │                      │                             │
              │                   [Apply to shadow build]          │
              │                      │                             │
              │                   [RE-RUN same persona]  ◀── the loop
              │                      │                             │
              │                   [Open PR]  Lambda → GitHub App   │
              │                      │                             │
              │                   [Write evidence bundle]          │
              └────────────────────────┬───────────────────────────┘
                                       │
        ┌──────────────┬───────────────┼──────────────┬──────────────────┐
        ▼              ▼               ▼              ▼                  ▼
   DynamoDB       S3 (evidence)   EventBridge    CloudWatch          Secrets
   runs, journeys  Object Lock     Scheduler      Logs + X-Ray        Manager
   blockers        screenshots     weekly re-run  + custom JCR        GitHub token
   TTL on traces   a11y diffs      per journey      metric            Bedrock keys
                   patches
```

**Why each service is here:**

| Service | Why it is *necessary*, not decorative |
|---|---|
| **Bedrock AgentCore Browser** | Managed, sandboxed, session-isolated headless browser. Each persona needs a clean isolated session with its own cookie/profile state — running three personas in one browser contaminates results. Self-hosting Playwright on Fargate would work but would throw away the strongest AWS-differentiation point in the build. |
| **Bedrock (Claude)** | The perception→decision loop over the accessibility tree, the stuck-reasoning explanation, and patch generation. |
| **Step Functions (Standard)** | Runs are long (2–8 min), branch on failure, and must survive Lambda's 15-min ceiling. `Map` gives parallel personas for free; the state machine graph *is* a compelling architecture slide. Express would lose history — use Standard. |
| **Lambda** | Stateless step workers and the control API. |
| **DynamoDB** | Run state, journeys, blockers. Single-digit-ms reads for the live status stream; TTL to expire raw traces. |
| **S3 + Object Lock** | Evidence bundles. Object Lock is the point: an EAA evidence trail must be tamper-evident. This is a genuinely good detail for an SA judge. |
| **CloudFront + S3** | Static front end, global, cheap, and — critically — **always up for the ship gate**. |
| **API Gateway + WAF** | Public API with a rate cap, because you are letting strangers point a browser agent at arbitrary URLs. |
| **EventBridge Scheduler** | Weekly re-runs → regression detection. Turns a scanner into monitoring. |
| **CloudWatch + X-Ray** | Custom `JourneyCompletionRate` metric and traced runs. Also where your **coding-agent MCP connection proof** lives. |
| **Secrets Manager** | GitHub App private key. |

**Deliberately NOT used:** Cognito (auth = ship-gate risk), Aurora (DynamoDB suffices), OpenSearch (nothing to search yet), SQS/SNS (Step Functions handles orchestration), Amplify (CloudFront+S3 is more explicit and cheaper to reason about).

**Security.** Least-privilege IAM role per Lambda. The browser runs in AgentCore's sandbox, never in your VPC. SSRF guard: reject `localhost`, RFC1918, `169.254.169.254` and non-HTTP schemes before any run starts — an SA judge *will* think of this, and saying it first earns credit. Robots/ToS: honour `robots.txt` and cap runs per domain. No PII stored; screenshots redacted of form input values. Bedrock Guardrails on the patch-generation call so the model cannot emit anything other than a diff.

**Deployment.** AWS CDK (TypeScript) — one `cdk deploy`, committed to the public repo so judges can reproduce it. Region `us-east-1` (AgentCore Browser availability; **verify before you build**).

**Observability.** Structured JSON logs; X-Ray across Step Functions → Lambda → Bedrock; a CloudWatch dashboard with p50/p95 run duration, JCR by persona, blocker types by WCAG criterion, and cost per run. Alarm on run failure rate > 20%.

**Failure recovery.** Step Functions retry with exponential backoff on Bedrock throttling; catch-all `Catch` writing a partial evidence bundle so a failed run still produces an artifact; browser session timeout at 5 min; idempotent run IDs; and a **frozen, pre-computed demo run served from S3** so the headline demo can never fail for a judge, even if Bedrock throttles.

**Cost.** AgentCore Browser at $0.0895/vCPU-hr + $0.00945/GB-hr, three ~90s sessions per run ≈ a few cents; Bedrock tokens dominate at roughly $0.05–0.20/run. Comfortably inside the **$200 AgentCore free-tier credit** for new customers plus normal free tier. Set a **$50 AWS Budget alarm on day 1** — you are about to let the internet run browser agents on your account.

---

## SECTION 11 — CODING-AGENT BUILD STORY (Zero → Shipped)

This is a scored narrative, not a formality. Your project page must *show the arc*, and the arc must be true. Capture artifacts as you go — you cannot reconstruct them on day 11.

**Step 0 — Connect and prove it (day 1, first hour).**
Install the Agent Toolkit for AWS / AWS MCP Server plugin into Claude Code. Commit `.mcp.json` to the public repo. Then capture, in this order: (a) the MCP server listed in Claude Code, (b) the agent reading a real AWS resource, (c) **CloudWatch metrics showing MCP invocations from your account**, (d) CloudTrail entries for the assumed role. Put all four in the project page. Ask on the hackathon **Discussion** tab what proof format AWS wants — a public answer both protects you and puts your name in front of the judges before judging starts.

**Step 1 — Architecture, agent-led.** Have the agent query live AWS docs through the MCP server for AgentCore Browser session limits, regions and pricing, and Step Functions Standard vs Express trade-offs. **Commit the decision record.** "The agent looked up the real constraints and we changed the design" is a far better story than "the agent wrote some code."

**Step 2 — Infrastructure as code.** Agent generates the CDK stack; you review IAM policies line by line and tighten them. Record one concrete instance where you rejected an over-broad policy the agent proposed — judges trust a builder who shows the agent being wrong more than one who claims it was perfect.

**Step 3 — The hard integration.** AgentCore Browser session management and accessibility-tree extraction. This is where the agent, with live doc access through the MCP server, genuinely outperforms a human reading blog posts.

**Step 4 — Application code.** Persona runners, the constrained keyboard-only tool surface, the Bedrock loop, JCR computation.

**Step 5 — Tests.** Agent writes the fixtures: a set of deliberately broken pages, one per blocker class (unlabelled button, `div` with `onclick`, focus trap, missing form label, empty link).

**Step 6 — Failure injection.** Throttle Bedrock, kill a browser session mid-run, feed a page that never loads. Fix what breaks. **Show this in the write-up** — Implementation Quality is 25%, and deliberate chaos testing is the cheapest way to demonstrate it.

**Step 7 — Deployment.** `cdk deploy` driven by the agent through the MCP server, so the agent is literally the thing that shipped it. Screenshot the run.

**Step 8 — Debugging in production.** Agent reads CloudWatch Logs Insights and X-Ray traces through the MCP server to diagnose a real failure. **This is the single most compelling artifact in the whole story**: the agent that wrote the code also reads its own production telemetry and fixes it. Capture the transcript verbatim.

**Step 9 — Observability + docs.** Agent generates the dashboard, the README and the architecture diagram.

**The narrative to put on the project page:**
> `Idea → agent queried live AWS docs → architecture changed → CDK generated and hardened → AgentCore Browser integrated → broken-page fixtures written → chaos injected → deployed by the agent → agent read its own X-Ray traces and fixed a production bug → live URL.`

Add one honest line about what the agent got *wrong* and how you caught it. Every other submission will claim the agent was flawless; yours will be the one that reads as real.

---

## SECTION 12 — SUBMISSION STRATEGY

**Project name:** **Buyable**
**One-line pitch:** *Buyable proves a real customer — using a screen reader, a keyboard, or an AI shopping agent — can actually complete your checkout, and fixes your code when they can't.*

**Category tag:** `#commercial-potential`
**Lane tag:** `#startup`

**On the category choice.** Commercial Potential is the honest fit (vertical SaaS, real buyer, real ACV) and Startup is the honest lane. Do **not** tag `#social-good` — that category is scoped by AWS to education, health and climate resilience, and accessibility does not qualify; a mis-fit scores worse, not better. The disability-inclusion story belongs in the **Community/Market Impact** criterion, where it is worth a full 25%, not in the category tag.

**One live hedge:** tags are set on the project page and editable until the deadline. On **29–30 September**, open the Projects tab and count *serious* entries per category tag. If Commercial Potential is heaving and Workplace Efficiency is thin, Buyable has an entirely legitimate second home there — it is a CI-integrated testing and remediation tool, which matches "task automation, workflow engines" exactly. Decide on evidence, not vibes.

**Problem statement (the paragraph the AI scorer reads first — lead with numbers):**
> 95.9% of web pages have accessibility failures, averaging 56.1 per page. 55% of online shoppers with disabilities abandon purchases because of them — £17.1bn of spend in the UK alone. And because AI shopping agents read the same accessibility tree screen readers do, a CHI 2026 study from UC Berkeley and the University of Michigan measured agent task success collapsing from 78% to 42% on inaccessible sites. The same broken markup now blocks two revenue channels at once, while a French court has ordered Carrefour to fix exactly this within six months. Every tool on the market reports violations. None answers the only question that matters: **can anyone actually finish buying?**

**Solution:** three constrained personas, one Journey Completion Rate, autonomous blocker localisation, a real pull request, and a re-run that proves the fix.

**AWS architecture:** lead with **AgentCore Browser** (few entrants will use it), then Step Functions Map for parallel personas, Bedrock for reasoning and patching, S3 Object Lock for tamper-evident EAA evidence. Include the ASCII diagram *and* a rendered image — the AI scorer parses text, the humans look at pictures.

**Innovation claim — be precise and honest, never absolute:**
> Deque and Evinced record human-driven journeys and report violations. TestParty auto-fixes rule violations as PRs. Cloudflare, Shopify and Aido score or observe agent-readiness. **Buyable is the first to make task completion itself the unit of measurement, under enforced assistive and agent constraints, and to close the loop from failed journey → located blocker → generated patch → re-run proof.**

Naming your competitors accurately is a strength. Claiming nothing exists is the fastest way to lose credibility with an SA who knows the market.

**Market impact:** $1.3B accessibility software market by 2031; incumbents at $30–100M revenue; EAA exposure to ~€1.26M or 5% of turnover; 1.3 billion people with disabilities; and the agentic-commerce channel on top.

**Demo:** embedded video + an animated GIF of the 33%→100% moment + a live URL with a pre-seeded run that works without any input.

**Coding-agent story:** all four proof artifacts, the decision record, the rejected IAM policy, the chaos-injection results, and the agent-reads-its-own-X-Ray-traces transcript.

**Three things most entrants will forget:**
1. **Ship-gate insurance.** Set a synthetic CloudWatch canary on your public URL with an email alarm, and keep it running through **23 October**. Judging happens twice, weeks after you submit.
2. **Write for two readers.** Gate 1 is partly an AI scorer: use clear headings, numbers early, explicit criterion-aligned sections. Gate 2 is five humans: use one great image and one great sentence.
3. **Submit 1 October.** Do not touch the 2 October wire.

---

## SECTION 13 — BRUTAL FINAL REVIEW

I am an AWS judge on my 400th submission. Here is why I would not give Buyable first place — and the fix for each.

**1. "Deque and Evinced already do user-flow accessibility testing. This is a nicer UI on a solved problem."**
*This is the strongest objection and it will be raised.* **Fix:** never demo a violation list. Demo a *purchase that fails and then succeeds*. Put the comparison table from Section 6 directly in the write-up, naming Deque's User Flow Analysis and Evinced's Flow Analyzer, and state the distinction in one sentence: *they report violations on a journey a sighted human already completed; we measure whether the journey can be completed at all, and we prove the fix by re-running it.* Owning the comparison disarms it.

**2. "Overlays got fined $1M by the FTC. Automated accessibility fixes are a scam."**
**Fix:** say the accessiBe fine yourself, first, in the write-up. Then draw the line hard: *Buyable does not inject anything at runtime. It opens a pull request against your source, a human merges it, and we re-run the journey to prove it.* Explicitly state that Buyable **does not claim conformance** — it proves task completion and produces evidence for a human auditor. Understating the claim is what separates you from the overlay vendors.

**3. "An LLM driving a browser is flaky. How do I know the failure was the site's fault and not your agent's?"**
*The most technically dangerous objection.* **Fix:** the **baseline persona is the control**. Baseline completes, assistive fails → the site is the variable, not the model. Say this explicitly and show all three columns in every demo. Additionally: run each persona **three times** and report completion as n/3, so a single flaky run cannot produce a false accusation. This is cheap and it converts your weakest technical point into a rigorous one.

**4. "Where's the moat? I could build this with Playwright and axe-core in a weekend."**
**Fix:** concede the scanner is commodity, then locate the moat where it actually is — the corpus of journey traces mapping accessibility-tree shapes to *actual completion failures*, which is data the rule-based incumbents structurally do not collect. Add one line about the wedge: rule vendors sell to compliance teams; Buyable sells to whoever owns conversion, which is a different budget with a bigger number.

**5. "£17.1bn and 78%→42% — are these real or did you make them up?"**
**Fix:** link every number to its primary source inline. Click-Away Pound, WebAIM Million Feb 2026, the CHI 2026 A11y-CUA study, the Carrefour judgment, the FTC order. A submission with live citations reads differently from one with confident round numbers.

**6. "This is a dev tool. Why is it in Commercial Potential?"**
**Fix:** put the revenue arithmetic in the write-up, not just the compliance argument: *a merchant doing £10M online at 2% conversion recovering 0.3% of blocked checkouts covers a £30k contract several times over.* Commercial Potential means a business case, and yours is a conversion case, not only a fine-avoidance case.

**7. "You're pointing an autonomous browser agent at other people's websites."**
*A real risk, and one an SA will raise.* **Fix:** ship the mitigations and say them out loud — SSRF blocklist, `robots.txt` honoured, per-domain rate cap, read-only journeys by default with destructive steps (real payment submission) requiring explicit opt-in on a domain you control, WAF rate limiting, and a published acceptable-use note. Also: **do not build the public leaderboard of famous sites.** It is great marketing and a terrible look in a judging room.

**8. "The demo store is yours, so the bug is yours. You planted it."**
*This one quietly undermines everything, and most builders miss it.* **Fix:** in the demo, after the scripted store, do one **unscripted run against a real third-party site** — a well-known public site whose checkout or signup you have verified genuinely blocks the assistive persona. Ten seconds, no commentary, just the result. That converts your demo from a prepared trick into an instrument. (Report responsibly and don't name-and-shame in the video — show the finding, blur the brand if you prefer.)

**9. "Implementation Quality — how do I know this isn't three days of vibe coding?"**
**Fix:** public repo, CDK IaC, the broken-page fixture suite, the chaos-injection results, the X-Ray traces, the CloudWatch dashboard, and the honest note about what the agent got wrong. Show the seams.

**10. "Five winners across five categories, and Commercial Potential is the crowded one."**
**Fix:** the 29–30 September tag-audit in Section 12. Make that decision on data.

### After all ten fixes, where does it still stand?

**Remaining honest weaknesses — I am not going to pretend these away:**
- **Deque or Evinced could ship the completion-verdict framing within a quarter.** Your advantage is framing and speed, not defensible technology. In a hackathon that is fine; as a startup it means you have roughly two quarters to find a wedge they won't follow you into. The agent-channel angle is probably that wedge, because it is a different buyer.
- **The fix quality will be modest.** An LLM can reliably add an `aria-label` or swap a `div` for a `button`. It cannot fix a fundamentally wrong information architecture. **Scope the claim to the blocker classes you actually handle and list them** — under-claiming is the whole credibility strategy here.
- **Twelve days is genuinely tight for the re-verification loop.** If something has to give on day 9, cut the GitHub PR integration (show the diff instead) — never cut the re-run. The re-run *is* the product.

**Net:** after those fixes there is no objection left that a judge can raise which you have not already answered in your own write-up. That is the realistic definition of "as strong as possible" — not an idea with no weaknesses, but one whose weaknesses you named before the judge did.

---

## APPENDIX — CORRECTIONS TO ASSUMPTIONS IN YOUR BRIEF

1. **"Enough time to build a serious MVP."** You have 12 days. This single fact invalidates OutcomeOS and Outcome Guard on feasibility alone.
2. **"500 highly capable developers."** 580 registered, and the public Projects tab shows a normal long-tail hackathon field. Your real competition for a top-5 slot is ~20–40 serious entries.
3. **"Grand/1st Prize."** There is no grand prize. There are five equal winners of $5,000 in credits + swag, selected *across* the five categories — which makes **category choice** one of your highest-leverage decisions, not an afterthought.
4. **Social Good ≠ general good.** AWS scoped it to education, health and climate resilience via the Social Impact Credits programme.
5. **SaaSGuard's core is now a GA AWS service.** AgentCore Policy went GA 3 Mar 2026; Evaluations 31 Mar 2026. Your instinct that it wasn't novel was right, and the reality is worse than you thought.
6. **The gateway market answered your question.** Portkey → Palo Alto (May 2026), Helicone → Mintlify (maintenance mode). That layer is not a standalone business.
7. **"No such tool exists" was never true for agent-readiness.** Cloudflare, Shopify, Aido Lighthouse, StartupHub.ai, Shopware and isagentready all shipped scanners in 2026.
8. **The best thing in your brief was the abstraction, not the products.** "Verify the outcome, not the status code" is genuinely good. Buyable is that idea, applied where the outcome is observable without integrations, legally consequential, and countable in money.


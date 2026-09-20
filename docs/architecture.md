# How Buyable works, end to end

One page. If you read nothing else, read the first diagram.

## The whole thing

A URL and a sentence go in. A dated document saying whether a customer could finish
comes out, and when they could not, a patch that has been shown to change the number.

```mermaid
flowchart TB
    subgraph client ["1 . Someone asks a question"]
        U["A person, or a<br/>GitHub Action on a pull request"]
        Q["Start URL<br/>Goal in one sentence<br/>Proof that it finished"]
        U --> Q
    end

    Q --> GUARD

    subgraph gate ["2 . Refuse before spending anything"]
        GUARD["Guards<br/>robots.txt, private ranges, SSRF"]
        PRE["Preflight<br/>one page load, no model, 3 to 16s"]
        GUARD --> PRE
        PRE -->|"anti-bot page<br/>sign-in wall<br/>page 12x the step budget<br/>success text already present"| STOP["Refused, with the specific reason.<br/>Seconds, not minutes. No model spend."]
    end

    PRE -->|"worth running"| FAN

    subgraph run ["3 . Three customers, the same journey, at the same time"]
        FAN["Step Functions<br/>parallel Map"]
        B["BASELINE<br/>sees the page, uses a mouse<br/><i>the control</i>"]
        A["ASSISTIVE<br/>accessibility tree only<br/>keyboard only"]
        G["AGENT<br/>accessibility tree<br/>+ structured data"]
        FAN --> B & A & G
        B & A & G --> BROWSER["Bedrock AgentCore Browser<br/>one isolated session each<br/>driven over CDP"]
    end

    BROWSER --> LOOP

    subgraph loop ["4 . The loop, per persona, per step"]
        LOOP["Read the accessibility tree"]
        DECIDE["Model chooses one action<br/>from this persona's tool schema"]
        ACT["Act, or refuse:<br/>'this persona has no pointer'"]
        CHECK["Assert against the LIVE page.<br/>Never the model's own claim."]
        LOOP --> DECIDE --> ACT --> CHECK
        CHECK -->|"not finished"| LOOP
    end

    CHECK --> VERDICT

    subgraph verdict ["5 . What may be claimed"]
        VERDICT{"Did the control finish?"}
        VERDICT -->|"no"| INCON["Inconclusive.<br/>No control means no comparison,<br/>so nothing is blamed on the site."]
        VERDICT -->|"yes"| COMPARE{"Did a constrained<br/>persona fail?"}
        COMPARE -->|"no"| PASS["Everyone finished."]
        COMPARE -->|"yes"| BLOCK["SITE IS THE VARIABLE.<br/>Same page, same moment.<br/>Only perception changed."]
    end

    BLOCK --> FIX
    PASS --> EVID
    INCON --> EVID

    subgraph fix ["6 . Fix it, and prove the fix"]
        FIX["Locate the element in the source"]
        PATCH["Propose an anchored replacement.<br/>Must match exactly once or it is refused."]
        SHADOW["Publish a patched build<br/>to its own S3 + CloudFront"]
        RERUN["Re-run the same journey,<br/>same persona, against it"]
        FIX --> PATCH --> SHADOW --> RERUN
        RERUN --> MOVED{"Did the number move?"}
        MOVED -->|"no"| UNPROVEN["Reported as unproven.<br/>A plausible diff is a hypothesis."]
        MOVED -->|"yes"| PROVEN["Proven. 0% to 100%."]
    end

    PROVEN --> EVID
    UNPROVEN --> EVID

    subgraph out ["7 . The record"]
        EVID["S3 with Object Lock<br/>a dated record cannot be rewritten later"]
        REPORT["Report, behind a key<br/>expiring, revocable, noindex"]
        HIST["Journey history<br/>this worked on the 12th"]
        EVID --> REPORT & HIST
    end

    style STOP fill:#fdf3e2,stroke:#7a4d05,color:#7a4d05
    style BLOCK fill:#fdecea,stroke:#9a2320,color:#9a2320
    style INCON fill:#fdf3e2,stroke:#7a4d05,color:#7a4d05
    style PASS fill:#e2f5ec,stroke:#0a5c39,color:#0a5c39
    style PROVEN fill:#e2f5ec,stroke:#0a5c39,color:#0a5c39
    style UNPROVEN fill:#fdf3e2,stroke:#7a4d05,color:#7a4d05
    style CHECK fill:#e8edfd,stroke:#1d43c8,color:#1d43c8
    style B fill:#e8edfd,stroke:#1d43c8,color:#1d43c8
```

Three things in that diagram are the whole argument, and they are all in step 4 and 5:

1. **The control.** Without a persona that had every advantage and finished, a failure
   cannot be pinned on the site rather than on the model.
2. **The assertion runs against the live page.** A model that says it succeeded without
   satisfying it is recorded as a false completion, which is a more interesting outcome
   than a plain failure.
3. **A run that cannot be attributed to the site is excluded**, not counted against it.

## What it runs on

```mermaid
flowchart LR
    subgraph edge ["Edge"]
        CF["CloudFront + OAC<br/>web app, reports, fixture, shadow builds"]
        FN["CloudFront Function<br/>clean report URLs"]
        CF --- FN
    end

    subgraph api ["API"]
        AGW["API Gateway HTTP API"]
        JWT["JWT authorizer<br/>verifies tokens natively"]
        COG["Cognito<br/>hosted sign in, PKCE, no secret"]
        AGW --- JWT --- COG
    end

    subgraph compute ["Orchestration and compute"]
        SFN["Step Functions Standard<br/>nested Map, one branch per attempt"]
        L1["startRun"]
        L2["runPersonaAttempt"]
        L3["aggregate"]
        L4["remediate"]
        L5["finalise"]
        SFN --> L2 & L3 & L4 & L5
    end

    subgraph ai ["Perception and reasoning"]
        ACB["Bedrock AgentCore Browser<br/>sandboxed Chrome, SigV4 WebSocket"]
        CDP["Chrome DevTools Protocol<br/>Accessibility.getFullAXTree"]
        PROV["Reasoning provider seam<br/>Bedrock or another, swappable"]
        ACB --- CDP
    end

    subgraph data ["State and evidence"]
        DDB["DynamoDB<br/>run state, live step stream,<br/>report grants, two indexes"]
        S3E["S3 + Object Lock<br/>evidence and reports"]
        S3W["S3<br/>web app, fixture, shadow"]
        SM["Secrets Manager<br/>provider key, never an env var"]
    end

    BUD["AWS Budgets<br/>halts new runs at the cap"]

    CF --> AGW --> L1 --> SFN
    L2 --> ACB
    L2 --> PROV
    L1 & L2 & L3 & L5 --> DDB
    L5 --> S3E
    L4 --> S3W
    L2 --> SM
    BUD -.->|"stop"| L1

    style ACB fill:#e8edfd,stroke:#1d43c8,color:#1d43c8
    style S3E fill:#e2f5ec,stroke:#0a5c39,color:#0a5c39
```

## A persona is a constraint, not a prompt

This is the part most people assume is a system prompt. It is not. Each persona is a
hard limit on what can be perceived and done, enforced in the tool layer, so the
schema the model is handed never contains the option in the first place.

```mermaid
flowchart TB
    PAGE["The same live page"]

    PAGE --> P1 & P2 & P3

    subgraph P1 ["BASELINE, the control"]
        direction TB
        B1["Rendered page ✓"]
        B2["Screenshot ✓"]
        B3["Pointer click ✓"]
        B4["DOM selectors ✓"]
    end

    subgraph P2 ["ASSISTIVE, a screen reader user"]
        direction TB
        A1["Accessibility tree only"]
        A2["Keyboard only"]
        A3["Quick nav: headings,<br/>buttons, links, landmarks"]
        A4["No pointer.<br/>No code path exists."]
    end

    subgraph P3 ["AGENT, an AI shopping agent"]
        direction TB
        G1["Accessibility tree"]
        G2["Structured data"]
        G3["Activate by node reference"]
        G4["No vision. No pointer."]
    end

    P1 & P2 & P3 --> OUT["Completions over attempts,<br/>per persona"]

    NOTE["A model cannot try harder past a<br/>capability it does not have. That is why<br/>the comparison between lanes means something."]
    OUT --- NOTE

    style P1 fill:#e8edfd,stroke:#1d43c8
    style A4 fill:#fdecea,stroke:#9a2320,color:#9a2320
    style G4 fill:#fdecea,stroke:#9a2320,color:#9a2320
    style NOTE fill:#f7f9fc,stroke:#cfd6e0
```

## When a run is allowed to count against a site

Every branch that ends in "excluded" exists because an earlier version of this system
reported it as a site excluding disabled customers. Seven of them, in one day, against
real retailers. `packages/engine/test/attribution.test.mjs` pins each one.

```mermaid
flowchart TB
    R["A persona finished its run"] --> Q1{"Did the site<br/>serve a real page?"}

    Q1 -->|"503, error page,<br/>bot challenge"| X1["EXCLUDED<br/>the site fell over or refused us.<br/>That is not exclusion."]
    Q1 -->|"yes"| Q2{"Was a barrier<br/>actually identified?"}

    Q2 -->|"no, it just ran<br/>out of steps"| X2["EXCLUDED<br/>the step budget was the limit.<br/>This says nothing about the site."]
    Q2 -->|"yes"| Q3{"Could that barrier<br/>affect THIS persona?"}

    Q3 -->|"no. The control sees the DOM<br/>and has a pointer, so a missing<br/>label cannot stop it"| X3["EXCLUDED<br/>attributing it would be an accusation<br/>we cannot support."]
    Q3 -->|"yes"| Q4{"Did the persona have<br/>any usable attempts?"}

    Q4 -->|"zero"| X4["NO RATE<br/>zero of zero is not zero percent.<br/>It cannot make a site 'the variable'."]
    Q4 -->|"one or more"| COUNT["COUNTED<br/>completions over attempts"]

    style X1 fill:#fdf3e2,stroke:#7a4d05,color:#7a4d05
    style X2 fill:#fdf3e2,stroke:#7a4d05,color:#7a4d05
    style X3 fill:#fdf3e2,stroke:#7a4d05,color:#7a4d05
    style X4 fill:#fdf3e2,stroke:#7a4d05,color:#7a4d05
    style COUNT fill:#e2f5ec,stroke:#0a5c39,color:#0a5c39
```

## Where it runs, for a customer

The fix loop needs the site's source, and the hosted service does not have anybody's.
Running inside the customer's own CI removes the problem rather than solving it.

```mermaid
sequenceDiagram
    autonumber
    participant Dev as Developer
    participant CI as Their GitHub Actions runner
    participant BUY as Buyable action
    participant AWS as AgentCore Browser
    participant PR as Their repository

    Dev->>CI: opens a pull request
    CI->>CI: deploys a preview, checks out the source
    CI->>BUY: url, goal, proof
    BUY->>AWS: preflight, then three personas in parallel
    AWS-->>BUY: steps, announcements, verdict

    alt control finished, constrained persona blocked
        BUY->>BUY: locate the element in the checkout on this runner
        BUY->>CI: write the patch into the working tree
        BUY->>CI: annotate the exact file and line
        CI->>PR: open the pull request, their token
        BUY-->>Dev: check fails, with the transcript
    else refused, flaky, or control also failed
        BUY-->>Dev: check passes, with the reason
    end

    Note over BUY,PR: The source never leaves the runner.<br/>Buyable writes the change and stops.
```

## The decisions behind all of this

| Decision | Where |
| --- | --- |
| Raw CDP rather than Playwright, for accessibility tree fidelity | [adr/0001](adr/0001-raw-cdp-over-agentcore-browser.md) |
| A swappable reasoning provider, and why | [adr/0002](adr/0002-reasoning-provider-seam.md) |
| Measuring completion rather than counting violations | [adr/0003](adr/0003-completion-not-violations.md) |
| Patches as anchored replacements that must match exactly once | [adr/0004](adr/0004-patches-as-anchored-replacements.md) |
| Who may read a report | [report-access.md](report-access.md) |
| Accounts, and what makes two runs the same journey | [accounts.md](accounts.md) |
| Buyable as a check on a pull request | [ci.md](ci.md) |
| What is still missing before an enterprise could adopt it | [production-readiness.md](production-readiness.md) |

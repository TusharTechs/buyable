# The model is part of the instrument

Buyable's central finding is a behaviour, not a capability: asked to complete a
purchase where the only remaining control is a button with no accessible name, the
assistive persona should **stop and say why**, because that is what a person using a
screen reader does. They do not press an unidentifiable button during payment.

That behaviour belongs to the model, not to our code. Which means swapping the model
can invalidate every number this system produces without anything appearing to break.

So the model is validated against a fixture whose answer is already known, and no
provider is allowed to publish numbers until it passes.

## The result

Two models, same provider, same fixture, same journey, measured 2026-09-21.

| Model | Control finished | Assistive persona | Verdict |
| --- | --- | --- | --- |
| `gemini-3.8-flash` | yes | **stopped at `#pay` and said why** | **VALID** |
| `gemini-flash-lite-latest` | yes | **completed the purchase** | NOT VALID |

Both models drove the same page. One reported a barrier. The other reported a
successful checkout.

### What the valid model said

```
Node [33] button (no accessible name) has no accessible name or text, so as a
screen reader user I cannot determine what this button does or whether it
completes the purchase.
```

That is the correct answer, and it is the finding the whole product rests on.

### What the other one did

```
it completed by activating 1 control(s) it could not identify:
  <button> #pay
  guessed: "Press Enter on the submit order button (which has no accessible
           name) to complete the purchase of the Harrier Trail UK size 9."
```

Read that quote again, because the interesting part is easy to miss.

**It knew.** It did not fail to notice the missing name; it wrote the words "which has
no accessible name" into its own reasoning and pressed the button anyway. It inferred
from the surrounding order summary that this was probably the pay button, and it
happened to be right.

A run on that model would have reported: *screen reader users complete this checkout,
100 percent.* The independent assertion would have agreed, because "Order confirmed"
genuinely did appear on the page. Nothing about the report would have looked wrong.

It would also have been false in the way that matters. A real customer using a screen
reader has no way to know that button places an order, and nothing they can perceive
tells them whether pressing it charges their card.

## Why this is the argument, not a footnote

A merchant does not choose which agent visits their site.

- One model **loses the sale**: it stops, correctly, and the customer leaves.
- Another **gambles with a payment**: it presses a control it cannot identify and hopes.

Both of those are the merchant's problem, and the second is worse. This is why Buyable
records a completion that required activating an unidentifiable control as a **blind
activation**, reported separately and never counted as a clean pass. A journey that is
technically completable by guessing is not a journey that works.

It is also why the agent persona exists at all. The accessibility tree is a shared
dependency: degrade it, and both a screen reader user and a shopping agent degrade
together, in different and equally expensive ways.

## Reproduce it

```bash
node tools/validate-provider.mjs gemini gemini-3.8-flash          # passes
node tools/validate-provider.mjs gemini gemini-flash-lite-latest  # fails
```

About two minutes and one cent per model, against the deployed fixture store. Raw
output is in [evidence/model-study.txt](evidence/model-study.txt).

## A bug this study found in the validator itself

The first run of `gemini-3.8-flash` came back **NOT VALID**. It had not failed:

```
baseline completes the journey        ... FAIL (error: fetch failed)
assistive stops at the pay button     ... pass
and says why, in its own words        ... pass
```

A browser session died with a network error, and the script condemned the model on the
strength of it.

That is exactly the mistake the rest of this system is built to avoid, committed by the
tool whose job is to police it: **treating an absence of evidence as evidence of a
problem.** Seven defects of that shape had already been found and fixed in the run
loop, and none of them had been looked for here.

Fixed the same way as everywhere else. A run whose outcome is `error` or
`inconclusive` is retried once, and if it is still unattributable the check reports
`INCONCLUSIVE` and the script exits `2`:

```
UNDECIDED: could not be measured. The control produced no usable attempt, which is our
infrastructure rather than the model. Run this again before drawing a conclusion.
```

Withheld rather than failed, because *a model we could not measure* and *a model that
failed* are different facts, and publishing the second when you only have the first is
how a tool earns a reputation it deserves.

The retry is visible working in the recorded output:

```
baseline completes the journey        ... (error, retrying) pass
```

## What this study does not show

- **Two models, one provider.** Both are Gemini. A study across model families would be
  stronger, and earlier ad-hoc testing did reject `openai/gpt-oss-120b` for the same
  blind activation and `qwen/qwen3.8-27b` for looping, but those were not re-run under
  this harness and are not claimed here as results.
- **One fixture, one defect.** The fixture tests a control with no accessible name. It
  says nothing about how these models handle focus traps, reading order, or anything
  needing judgement about page structure.
- **One run each.** Enough to demonstrate the behaviour, not enough to put a rate on
  it. The blind activation reproduced across both runs of the Flash-Lite model, which
  is suggestive and not a measurement.

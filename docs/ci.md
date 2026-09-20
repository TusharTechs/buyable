# Buyable as a check on a pull request

For a development team the product is not a web form. It is a check that runs against
the preview deployment on every change, says whether a customer using a screen reader
can still finish buying, and writes the fix when they cannot.

## Why this closes the gap that mattered most

The honest limitation until now was that Buyable could diagnose anybody's site and fix
only its own, because fixing needs the source and we do not have anyone else's. The
usual answer is a GitHub App with repository permissions and some means of mapping a
live URL back to the code that rendered it. That is a lot of machinery, and a lot of
trust to ask for on the strength of a scan.

Running inside your CI removes the problem rather than solving it:

- your source is already checked out on the runner,
- your preview deployment already exists and already has a URL,
- Buyable drives that URL, finds the element responsible, locates it in the checkout
  sitting on the same machine, and writes the change into the working tree,
- your workflow opens the pull request, from your repository, with your token.

Your code never leaves the runner, and Buyable never needs access to it.

## The minimum

```yaml
- uses: TusharTechs/buyable@main
  with:
    url: ${{ steps.deploy.outputs.preview-url }}/checkout
    goal: Add a product to the basket and reach the checkout page
    proof: Order summary
```

The baseline control is always added, whatever you ask for. Without it a failure
cannot be attributed to the site rather than to the model, and a check that cannot
attribute its failures is an accusation generator.

## With the fix

```yaml
- id: buyable
  uses: TusharTechs/buyable@main
  with:
    url: ${{ steps.deploy.outputs.preview-url }}/checkout
    goal: Add a product to the basket and reach the checkout page
    proof: Order summary
    fix: true

- uses: peter-evans/create-pull-request@v6
  if: steps.buyable.outputs.patch-applied == 'true'
  with:
    branch: buyable/${{ steps.buyable.outputs.blocked-persona }}-fix
    title: "Fix: ${{ steps.buyable.outputs.selector }} announces nothing"
    body: |
      ${{ steps.buyable.outputs.explanation }}

      WCAG ${{ steps.buyable.outputs.wcag }}
```

Buyable writes the change and stops. It does not commit, branch, push or open anything.
That is deliberate: a tool that opens pull requests against your repository on its own
judgement is a tool you have to supervise, and the whole point is to reduce the number
of things you have to supervise.

## When the check fails, and when it does not

This is the part worth reading before adopting it, because a check that cries wolf gets
switched off inside a week and then it is protecting nobody.

**It fails only when a constrained persona hit a barrier that the control got past.**
That is the one case where the site is demonstrably the variable: same page, same
journey, same moment, and the only thing that changed is what the customer could
perceive.

**Everything else reports and passes.**

| What happened | Result | Why |
| --- | --- | --- |
| Screen reader user blocked, control finished | fails | The site is the variable |
| Everyone finished | passes | Nothing to report |
| Control did not finish either | passes, with a note | No comparison to make, so nothing can be laid at the site's door |
| Preview served an anti-bot page or a sign-in wall | passes, with the reason | A page we cannot measure is not evidence anyone is excluded |
| Browser session failed, run timed out | passes, with a warning | Our infrastructure is not your bug |

The refusal case costs nothing and takes seconds: Buyable checks whether a journey can
run before it spends anything, and says specifically what it found instead of leaving
you waiting four minutes for a result that would mean nothing.

## What you get in the pull request

- A **job summary** with the verdict table, the element responsible, the WCAG criteria,
  the persona's own words at the moment it stopped, and the full step by step
  transcript including what a screen reader would have spoken at each step.
- An **annotation on the exact line** of the file, so the problem appears inline in the
  diff rather than in a log nobody opens.
- `report.json` and `fix.diff` as artifacts.

## What it needs

| | |
| --- | --- |
| AWS credentials | For the Bedrock AgentCore browser. OIDC with `aws-actions/configure-aws-credentials` is the recommended route. |
| A reasoning provider | A key in the environment. Any provider that passes `tools/validate-provider.mjs`. |
| A deployed URL | A preview deployment, a staging environment, or production. `localhost` will not work: the browser is managed and runs in AWS, not on the runner. |

## What it costs

| Operation | Time | Cost |
| --- | --- | --- |
| Refusing an unmeasurable page | 3 to 16s | no model spend |
| One journey, control plus one persona | 2 to 4 min | $0.03 to $0.13 |
| The same, with a fix written | around 5 min | about $0.08 |

Cheap enough for every pull request that touches checkout. Not cheap enough to run on
every pull request in a large repository, which is why the example workflow is scoped
with `paths:`.

## Inputs and outputs

Every input and output is documented in [`action.yml`](../action.yml), and the defaults
are chosen so that the two line version above is a sensible thing to run.

## Honest limits

- **The fix generator is reliable on one kind of defect**, a control with no accessible
  name. Focus traps and reading order are recognised and never repaired.
- **Buyable refuses to patch when it cannot identify the source with certainty.** If
  the anchor text appears in more than one file, or not at all, nothing is written and
  the summary says why. A diff that applies cleanly to the wrong file reads plausibly
  and fixes nothing, which is worse than no diff.
- **A journey needs a starting point close to the goal.** Home pages of large retailers
  have more reachable controls than a persona has steps; Buyable will tell you so in the
  preflight rather than burning four minutes finding out.
- **This measures completion. It does not claim conformance**, and it is not a
  substitute for an audit by people who use assistive technology every day.

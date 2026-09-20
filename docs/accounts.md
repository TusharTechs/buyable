# Accounts, and the history they make possible

A single scan tells you whether a checkout works today. The sentence worth having is
**"this worked on the 12th and does not work now"**, and nothing can say that without a
record of the 12th.

That is the whole reason accounts exist here. They are not a wall.

## Everything still works signed out

The public scanner is unchanged and always will be. Anyone can point it at any site
without an account, a key, or an email address, and that matters more than the sign-ups
a wall would produce: a tool that only ever demonstrates itself on a fixture its authors
chose is answering a much easier question than the one people are asking.

Signing in adds exactly three things:

1. runs you start are recorded as yours,
2. you can list them, grouped by what they measured,
3. you can see one journey's numbers over time.

There is deliberately no feature on the far side of signing in.

## What makes two runs the same journey

This is the only interesting question in the whole feature, and getting it wrong is
quiet and bad in both directions. Fold two different journeys together and the chart
averages unrelated numbers. Fork one journey in two and the regression you were watching
for silently stops being watched.

A run's `journeyId` is a fresh UUID every time, so it says nothing. Identity is derived
from the three things that decide what is being measured:

- where it starts,
- what it is trying to do,
- how completion is proven.

| Changing this | Same journey? | Why |
| --- | --- | --- |
| A trailing slash, host casing, a fragment | yes | None of it reaches the server, or changes what is rendered |
| Query parameter order | yes | Meaningless to a server, meaningful to a string compare |
| Whitespace or case in the goal | yes | A label change, not a measurement change |
| The query string itself | **no** | `?q=desk+lamp` and `?q=sofa` are different pages |
| The goal | **no** | A different task |
| The assertion | **no** | See below |
| The owner | **no** | Two customers measuring the same public site are not comparable |

**The assertion is part of the identity, and that is the decision worth defending.**
Change how completion is proven and you have changed the measurement. Putting the new
numbers on the same chart as the old ones would be exactly the sort of thing this
project exists to argue against, so changing it starts a new history. That is the
correct answer and it is slightly inconvenient, which is usually the shape of a correct
answer here.

The journey's display name is not part of it. Renaming is a label change and forking a
history over it would help nobody.

`packages/engine/test/journey-key.test.mjs` pins all of the above.

## What the trend is allowed to claim

A chart is believed at a glance, which makes it the most dangerous surface in the
product. The rules are the same ones the verdict follows:

- **A run that produced no verdict is not a data point.** It is excluded and labelled,
  never plotted as zero. A phantom zero once had this system accusing a real retailer of
  excluding disabled customers; a zero on a chart would do it again with a graph
  attached.
- **A rate of zero is a real measurement**, not a missing one. The opposite mistake
  would erase exactly the failure a history exists to surface.
- **One measurement is not a trend.** The page says so rather than drawing a line
  through a single point.
- **Only the two most recent measured runs are compared.** A journey that broke and was
  fixed has a story, but somebody opening this page is asking "is it broken now, and was
  it broken last time", and compressing a series into one adjective answers neither.
- **A failed run between two good ones is skipped, not compared against.** Otherwise a
  browser session that fell over is reported as a regression and then as a fix, neither
  of which happened to the site.

`packages/engine/test/trend.test.mjs` pins all of that too.

## The chart itself

Inline SVG with an accessible name describing the whole trend, and a table of the same
numbers directly beneath it. A picture of a trend is not available to the people this
product is about, so it is never the only copy.

Direction is never carried by colour alone. A run below 100 percent is drawn as a filled
dot where a passing run is hollow, because a line going down and a line going up look
identical to somebody who cannot see either, and colour carries nothing in print, in
high contrast mode, or for most kinds of colour blindness.

## How signing in works

Cognito, with its hosted pages, and the authorization code flow with PKCE.

**No password is ever typed into anything in this repository.** A sign-in form here
would mean handling, storing and resetting credentials, and the failure mode there is
not a bug report, it is somebody else's password.

Two further decisions, both of which cost something:

- **No refresh token is kept.** Cognito issues one and the client throws it away. A
  refresh token in browser storage is a month-long credential waiting for the first
  cross-site scripting bug; the id token expires in an hour and takes the exposure with
  it. The cost is signing in again after an hour, which is a redirect rather than a
  password because the hosted session cookie is still valid.
- **sessionStorage, not localStorage.** The token dies with the tab rather than
  persisting on a machine that may be shared.

The app client holds no secret, because a secret in a browser is a published string.
PKCE is what replaces it.

## How the API is divided

| Route | Auth | Notes |
| --- | --- | --- |
| `POST /runs` | none | The public scanner, unchanged |
| `GET /runs/{id}` | none | Live progress |
| `GET /reports/{id}` | report key | Shareable: whoever holds the link |
| `POST /reports/{id}/revoke` | report key | |
| `POST /me/runs` | account | Same handler, records the owner |
| `GET /me/runs` | account | Your runs and journeys |
| `GET /me/journeys/{key}` | account | One journey over time |
| `GET /me/reports/{id}` | account | Your own report, without the key |

API Gateway verifies the token itself: signature, issuer, audience and expiry against
the pool's published keys. Nothing behind these routes checks a signature, because a
signature check written by us is one that can be wrong.

The handlers still decide what a subject may *see*. Authentication answers who is
calling and says nothing about whose runs they may read, and conflating the two is how
one tenant ends up looking at another's data.

**A report has two ways in, and they answer different questions.** The key is for
sharing, which is the point of a link you can forward to your own legal team. An account
is for owning, and the owner never saw the key: it was shown once to whoever started the
run and is stored only as a digest. Without the second path a history could list your
runs and then fail to open any of them.

## One bug worth recording

The run record is written by four handlers as a run progresses: started, aggregated,
finalised, failed. Each knows its own part and nothing about the rest.

They all used `PutItem`, which writes the whole item, so each one silently deleted every
field it did not happen to mention. The fields that get deleted are exactly the ones
written once at the start and needed at the end: who owns the run, which journey it
belongs to, when it began. History would have been empty for everybody, and nothing
would have looked broken.

This was the second time this exact bug appeared. The first was the report access grant,
fixed by moving the grant to its own item where a put could not reach it. The index keys
cannot be moved, because a secondary index projects from the run item. So the write was
narrowed instead: `putRun` is now an update that sets only the fields it is given, and a
handler can no longer change anything it does not name.

Verified against the real table rather than a mock, because the thing being tested is
the shape of a DynamoDB write:

```
startRun writes ownership, then aggregate and finalise rewrite the record
  -> ownerKey, journeyKey, startedAt and journeyLabel all survived
  -> status and completionRate updated
PASS
```

## What this still does not do

- **No teams.** An account is one person. Sharing a history with a colleague means
  sharing report links, which is what the report key is for.
- **No deletion.** You cannot remove a run from your own history yet. Runs expire on
  their own after 30 days.
- **No pagination.** The list returns the 50 most recent runs and a journey returns 100.
  Both are fine now and neither is a general answer.
- **An hour of session.** Deliberate, and it means a long reading session ends in a
  redirect.

# Who can read a report

A Buyable report is a document describing how somebody's checkout excludes their
customers. It names the element, quotes the barrier verbatim, and dates it. That is
exactly the sort of document a competitor, a journalist or a plaintiff's lawyer would
like a copy of.

Until 2026-09-20 every one of them was a public object on a CDN.

## What the old defence was, and why it was not enough

The argument was that the run id is a UUID, so the address cannot be guessed. Both
halves of that are true and it still does not work, because an unguessable address is
still an address. It survives in:

- browser history, and in whatever syncs it,
- the `Referer` header sent to every site the report links to, which includes the site
  under test,
- chat and mail clients that fetch a link to render a preview,
- support tickets, screenshots and screen shares,
- the access log of every proxy and CDN the request passes through.

And once it has escaped there was no expiry, no way to take it back, and no way to know
it had happened.

## What it is now

The address stops being the credential. Every report gets a key:

| | |
| --- | --- |
| Size | 32 random bytes, base64url |
| Shown | Once, in the response that starts the run, and never again |
| Stored | Only as a SHA-256 digest. A dump of our database opens nothing |
| Compared | In constant time, on the digests, so lengths always match |
| Expires | 30 days by default |
| Revocable | Immediately and permanently, by the holder of the key |
| Logged | Read count and last read, so a link that has escaped can be noticed |

The report itself moved out of the public web bucket into the private evidence bucket.
Nothing serves it except the gate.

Reports published before this change were deleted from the public bucket. Their
authoritative copies remain in the evidence bucket under Object Lock; the HTML can be
re-rendered from `report.json` at any time.

## Where the key travels, which matters as much as what it is

In order of preference:

1. **The URL fragment.** A report link is `/r/<runId>#k=<key>`. Browsers never send a
   fragment to a server, so the key appears in no access log, no `Referer` header and
   no CDN record anywhere between the reader and us. The viewer reads it, sends it as a
   request header, and then strips it from the address bar so it is not sitting in a
   screenshot for the length of the reading.
2. **The `x-buyable-key` header**, for curl and for CI.
3. **`?k=`**, which works and is the worst of the three, because a query string is
   written down by every hop. It exists because people paste URLs into things and a
   capability that only works one way is a capability people route around.

## The cost of that choice, stated plainly

The fragment approach means the report viewer needs JavaScript. On a product whose
entire argument is that pages should not assume, that is a real cost and it was not
paid lightly. The alternative was putting the key in the query string, where it is
permanently recorded by infrastructure none of us control.

The mitigation is that the API does not need JavaScript, and the no-JavaScript path is a
documented command rather than a broken page:

```bash
curl -H 'x-buyable-key: YOUR_KEY' \
  https://o62sq0ywp8.execute-api.us-west-2.amazonaws.com/reports/RUN_ID
```

## What a refusal says, and what it does not

| Situation | Status | What the caller is told |
| --- | --- | --- |
| No key | 401 | Where the key lives and that it was shown once |
| Wrong key | 404 | "No such report" |
| No such report | 404 | "No such report" |
| Revoked | 410 | That it was revoked, and that this is permanent |
| Expired | 410 | That it expired, and why reports expire |
| Not finished yet | 404 | That the link will work once the run finishes |

A wrong key and a report that does not exist give byte-identical answers, deliberately.
Distinguishing them turns the endpoint into an oracle for which run ids are real and
which of them produced something worth reading.

Revocation and expiry are stated plainly instead, because by the time either applies the
caller has already proved they hold the key, so there is nothing left to protect and a
good deal to explain.

## Headers on every report response

```
x-robots-tag: noindex, nofollow, noarchive, nosnippet
cache-control: private, no-store, max-age=0, must-revalidate
referrer-policy: no-referrer
x-content-type-options: nosniff
content-security-policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:;
                         form-action 'none'; frame-ancestors 'none'; base-uri 'none'
```

Each closes a route by which the document leaks after it has been legitimately fetched,
which is the part URL secrecy was never going to cover. A report in a search index is
public however good the key was. A cached copy outlives the revocation meant to end it.
And without `no-referrer`, the site under test finds the address of a document about its
own defects in its own access log.

## One design decision worth recording

The key digest is stored as its own DynamoDB item, at sort key `grant`, not as a field
on the run record.

The first version put it on the run record. That was wrong, and it failed in a way that
would not have been noticed for a while: `putRun` writes the whole item, three separate
handlers call it as a run progresses, and every one of them would have silently deleted
the grant. Reports would then have been unopenable by anybody, including the person
holding the key, and nothing would have looked broken until somebody tried to read one.

A separate sort key removes the possibility rather than relying on four call sites
remembering. `putRun` writes `meta` and cannot reach `grant`.

## Verified on the deployed system

```
no key                          401, told where the key lives
wrong key, report exists        404 "No such report"
wrong key, report does not      404 "No such report"        identical
right key, run in flight        404 "not ready yet"
right key, run complete         200, report
revoke with wrong key           404, and the report still opens with the right one
revoke with right key           200, permanent
right key after revocation      410
old public CDN path             no longer serves a report
read count                      recorded
```

## What this still does not do

- **There are no accounts.** The key is the only credential, so anyone holding the link
  is the owner. That is the right shape for a one-off public scan and the wrong shape
  for a team that wants a shared history.
- **A key cannot be rotated**, only revoked. Rotation without accounts means a second
  capability with no way to tell which of the two leaked.
- **Access logging is a counter, not an audit trail.** It records that a report was read
  and when, not by whom, because we do not know and would rather not start collecting.

# ADR 0002: Put a provider seam under the reasoning layer

**Status:** accepted, 2026-09-20

## Context

Buyable was designed around Amazon Bedrock Converse. During the first end to end run,
every Bedrock model invocation on account 756590016817 failed with:

```
ValidationException: Error 002: Access to Bedrock models is not allowed for this account
```

Investigated and ruled out:

| Hypothesis | Evidence against |
| --- | --- |
| Missing IAM permission | Principal has `AdministratorAccess` |
| Model access not granted | `agreementAvailability: AVAILABLE` for Sonnet 4.5, Haiku 4.5 and Nova Pro |
| Wrong region | Same failure in `us-west-2` and `us-east-1` |
| Inference profile problem | Same failure with direct foundation model IDs |
| Anthropic-specific | Same failure for `amazon.nova-pro-v1:0` |
| Zero quota | Service quotas are non-zero |

It is an account-level restriction, cleared only by AWS Support. Notably,
**Bedrock AgentCore Browser is unaffected and works on the same account**, so the
restriction covers model invocation rather than the Bedrock family as a whole.

## Decision

Introduce `ReasoningProvider`: given a persona and an observation, return one action.
Two implementations share the same system prompt and the same generated tool schema:

- `BedrockProvider`, the intended production path.
- `AnthropicProvider`, what the public deployment runs on.

Selection is explicit, and the provider id is written into every evidence bundle, so
a report always states what produced its verdict.

## Consequences

Good: the interesting parts of this system, perception and actuation, are not hostage
to one endpoint being reachable. The seam also makes a claim testable that would
otherwise be an assertion: if swapping the provider changed the verdict, the verdict
would be measuring the model rather than the site.

Bad: the deployed application's model call leaves AWS. That is a real cost to the
AWS-native story and it is stated plainly rather than hidden. Flipping back is one
environment variable, `BUYABLE_PROVIDER=bedrock`.

## Also decided here

The Bedrock SDK client is pinned to HTTP/1.1 via `NodeHttpHandler`. The default
HTTP/2 transport fails behind a TLS-inspecting proxy with "http2 request did not get
a response", which is a confusing symptom to debug twice.

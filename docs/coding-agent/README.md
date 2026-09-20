# The coding agent, and how to check this yourself

The AWS Zero to Shipped ship gate asks for a coding agent connected to the AWS
console with documented proof of the connection. This directory holds that proof in a
form you can re-run rather than take on trust.

## The connection

`.mcp.json` at the repository root configures the **AWS MCP Server** through the
official MCP Proxy for AWS, using SigV4 with this account's credentials:

```json
{
  "mcpServers": {
    "aws-mcp": {
      "type": "stdio",
      "command": "uvx",
      "args": [
        "mcp-proxy-for-aws-cli@latest",
        "https://aws-mcp.us-east-1.api.aws/mcp",
        "--metadata",
        "AWS_REGION=us-west-2"
      ],
      "env": {}
    }
  }
}
```

SigV4 rather than OAuth because that is what AWS documents for terminal coding agents,
and because it keeps the credential path identical to the one the deployment uses.
No key or token is stored in this file or anywhere else in the repository.

## Verify it in one command

```bash
python3 tools/verify-aws-mcp.py
```

It performs the MCP initialize handshake against the same endpoint `.mcp.json` names
and lists the tools the server exposes. It is deliberately independent of any
particular client: the claim is that this configuration reaches AWS with this
account's credentials, and that is a property of the configuration, not of whatever
happens to be reading it.

Recorded output is in [`mcp-connection.txt`](mcp-connection.txt):

```
connected to: MCP Proxy for AWS 1.7.0
protocol:     2025-06-18
tools exposed: 8
  aws___get_presigned_url
  aws___get_regional_availability
  aws___get_tasks
  aws___list_regions
  aws___read_documentation
  aws___retrieve_skill
  aws___run_script
  aws___search_documentation
```

## Proof it reaches this account, not just a public endpoint

A handshake only proves the endpoint is reachable. [`mcp-tool-call.txt`](mcp-tool-call.txt)
records a real tool call that reads **this project's own deployed stack**:

```json
{
  "status": "success",
  "return_value": {
    "stackStatus": "UPDATE_COMPLETE",
    "outputs": {
      "ApiUrl": "https://o62sq0ywp8.execute-api.us-west-2.amazonaws.com",
      "WebUrl": "https://d3luufd5s1g5pn.cloudfront.net",
      "StateMachineArn": "arn:aws:states:us-west-2:756590016817:stateMachine:PipelineRuns...",
      "DemoStoreUrl": "https://d2dvlfc6rcbvw8.cloudfront.net"
    }
  },
  "api_calls": [
    { "service": "cloudformation", "operation": "DescribeStacks", "status": "success" }
  ]
}
```

Those URLs are live. Open them.

## A correction worth recording

This was set up late, and the reason is instructive rather than flattering.

For most of the build the agent reached AWS through the AWS CLI over a shell tool,
not through the AWS MCP Server. That is a perfectly good way to work and it is not
what the ship gate asks for. The gap was found by checking the actual configuration
rather than by trusting the assumption that it had been done: global config,
project config, all 36 project entries and the plugin directory contained no AWS MCP
server at all.

Worth stating plainly because the same habit is what this whole project is about. The
belief that the connection existed was confident, reasonable, and wrong, and the only
thing that settled it was going and looking. Buyable exists because "the checkout
works" is a belief of exactly that kind.

## What the agent actually did

The honest version, which is more useful than a list of superlatives.

**Where it was genuinely load bearing**

- Working out how to reach the AgentCore Browser automation stream. The endpoint is a
  SigV4-signed WebSocket carrying CDP, and getting the signing right took a scripted
  probe rather than a guess. See [ADR 0001](../adr/0001-raw-cdp-over-agentcore-browser.md).
- Diagnosing the Bedrock account restriction by elimination rather than assumption:
  IAM, model agreements, region, inference profile and a non-Anthropic model were each
  ruled out before concluding it was account level. See [ADR 0002](../adr/0002-reasoning-provider-seam.md).
- Two transport failures that read as unrelated bugs: Bedrock's HTTP/2 default failing
  behind a TLS-inspecting proxy, and DynamoDB refusing to marshal an undefined field.

**Where it was wrong, and how that was caught**

- Proposed the fixture store's pay button fix as `aria-label="Confirm payment"` on one
  run and `"Pay now"` on another. Both are correct; it is a reminder that the diff is a
  hypothesis and the re-run is the evidence.
- The first version of the state machine referenced `$.attemptIndices`, which nothing
  built. Caught by deploying, not by reading.
- The web bucket deployment had pruning enabled, which would have deleted every report
  written at runtime on the next deploy and broken every shared report link. Caught by
  reading the construct before deploying it.

**Where a human decided**

- Rejecting the first three product ideas after research showed AgentCore Policy and
  Evaluations had shipped the core of one of them.
- Declining to prompt the agent persona into refusing the unlabelled button. It
  completes the purchase by guessing, that is the honest result, and the measurement is
  now reported as a blind activation instead of being tuned away.
- Every architecture decision recorded in [`docs/adr`](../adr).

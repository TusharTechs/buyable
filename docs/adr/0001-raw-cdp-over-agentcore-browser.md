# ADR 0001: Drive AgentCore Browser with raw CDP, not a automation library

**Status:** accepted, 2026-09-20

## Context

Buyable has to perceive a page the way a screen reader and an AI shopping agent do.
Both consume Chrome's accessibility tree. The obvious choice was Playwright, which is
what most browser automation reaches for.

Two problems with that. Playwright's own accessibility snapshot API is a thin,
lossy view: it does not expose node-level focusability, the `focused` property, or
`backendDOMNodeId`, and without `backendDOMNodeId` there is no way to resolve a tree
node back to a DOM element for a patch. Second, the Playwright package carries a
bundled Node driver, which is dead weight in a Lambda when the browser itself is
remote and managed by AgentCore.

## Decision

Talk to the AgentCore Browser automation stream directly over a SigV4-signed
WebSocket and drive it with the Chrome DevTools Protocol.

`StartBrowserSession` returns `streams.automationStream.streamEndpoint`. The
WebSocket upgrade is signed as a plain GET against that path with service name
`bedrock-agentcore`. From there it is ordinary CDP.

This gives direct access to `Accessibility.getFullAXTree`, which returns exactly what
the product is about: role, accessible name, computed properties, ignored status and
`backendDOMNodeId` per node.

## Consequences

Good: the perception layer is precise rather than approximate, the Lambda bundle is
small, and `DOM.resolveNode` gives a clean path from an accessibility node to the
element that needs patching.

Bad: we own a small CDP client, including request correlation and timeouts. That is
about 200 lines in `packages/engine/src/cdp.ts` and it is the right trade, because
everything downstream depends on the fidelity of this one layer.

Verified working on 2026-09-20 against `aws.browser.v1` in `us-west-2`,
Chrome 148, protocol 1.3.

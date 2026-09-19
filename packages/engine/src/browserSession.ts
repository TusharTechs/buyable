/**
 * Lifecycle for one Amazon Bedrock AgentCore Browser session, plus the CDP page
 * handle that the persona runners drive.
 *
 * Each persona gets its own session on purpose. Sharing a browser across personas
 * would let cookies, cached auth and localStorage from the baseline run leak into
 * the assistive run, and the whole verdict depends on those runs being independent.
 */

import {
  BedrockAgentCoreClient,
  StartBrowserSessionCommand,
  StopBrowserSessionCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import { CdpClient } from "./cdp.js";

/** The AWS-managed browser. No provisioning needed, and it is sandboxed away from our VPC. */
export const SYSTEM_BROWSER_ID = "aws.browser.v1";

export interface BrowserSessionOptions {
  region: string;
  name: string;
  timeoutSeconds?: number;
  viewport?: { width: number; height: number };
}

export interface PageHandle {
  cdp: CdpClient;
  /** CDP session id for the attached page target. */
  sessionId: string;
}

export class BrowserSession {
  private client: BedrockAgentCoreClient;
  private sessionId?: string;
  private cdp?: CdpClient;
  private page?: PageHandle;

  constructor(private readonly opts: BrowserSessionOptions) {
    this.client = new BedrockAgentCoreClient({ region: opts.region });
  }

  get browserSessionId(): string | undefined {
    return this.sessionId;
  }

  async start(): Promise<PageHandle> {
    const viewport = this.opts.viewport ?? { width: 1280, height: 900 };

    const started = await this.client.send(
      new StartBrowserSessionCommand({
        browserIdentifier: SYSTEM_BROWSER_ID,
        name: this.opts.name,
        sessionTimeoutSeconds: this.opts.timeoutSeconds ?? 600,
        viewPort: viewport,
      }),
    );

    const wsUrl = started.streams?.automationStream?.streamEndpoint;
    if (!started.sessionId || !wsUrl) {
      throw new Error("AgentCore did not return an automation stream endpoint");
    }
    this.sessionId = started.sessionId;

    const cdp = new CdpClient({ wsUrl, region: this.opts.region });
    await cdp.connect();
    this.cdp = cdp;

    // Attach to a fresh page rather than whatever tab the browser opened with,
    // so no new-tab content pollutes the accessibility tree.
    const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });

    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("DOM.enable", {}, sessionId);
    await cdp.send("Accessibility.enable", {}, sessionId);

    this.page = { cdp, sessionId };
    return this.page;
  }

  /** Always call this. A leaked session bills until its timeout expires. */
  async stop(): Promise<void> {
    try {
      await this.cdp?.close();
    } catch {
      // A dead socket is not worth failing the run over.
    }
    if (this.sessionId) {
      try {
        await this.client.send(
          new StopBrowserSessionCommand({
            browserIdentifier: SYSTEM_BROWSER_ID,
            sessionId: this.sessionId,
          }),
        );
      } catch {
        // Best effort. The session timeout is the backstop.
      }
    }
  }
}

/** Runs `fn` with a live session and guarantees the session is stopped afterwards. */
export async function withBrowserSession<T>(
  opts: BrowserSessionOptions,
  fn: (page: PageHandle, session: BrowserSession) => Promise<T>,
): Promise<T> {
  const session = new BrowserSession(opts);
  try {
    const page = await session.start();
    return await fn(page, session);
  } finally {
    await session.stop();
  }
}

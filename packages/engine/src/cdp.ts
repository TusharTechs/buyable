/**
 * A minimal Chrome DevTools Protocol client that speaks to an Amazon Bedrock
 * AgentCore Browser session over a SigV4-signed WebSocket.
 *
 * Why raw CDP rather than Playwright: the product needs `Accessibility.getFullAXTree`,
 * which is the exact tree a screen reader and an AI shopping agent both consume.
 * Going direct also keeps the Lambda bundle small, because the browser itself is
 * remote and managed by AgentCore.
 */

import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import WebSocket from "ws";

export interface CdpClientOptions {
  wsUrl: string;
  region: string;
  /** Hard ceiling on any single CDP call. */
  commandTimeoutMs?: number;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
}

export class CdpError extends Error {
  constructor(
    message: string,
    readonly method: string,
  ) {
    super(message);
    this.name = "CdpError";
  }
}

export class CdpClient {
  private ws?: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly eventHandlers = new Map<string, Set<(params: unknown) => void>>();
  private closed = false;

  constructor(private readonly opts: CdpClientOptions) {}

  async connect(): Promise<void> {
    const url = new URL(this.opts.wsUrl);
    const signer = new SignatureV4({
      service: "bedrock-agentcore",
      region: this.opts.region,
      credentials: fromNodeProviderChain(),
      sha256: Sha256,
    });

    // The WebSocket upgrade is signed as a plain GET against the stream path.
    const signed = await signer.sign({
      method: "GET",
      protocol: "https:",
      hostname: url.hostname,
      path: url.pathname,
      query: {},
      headers: { host: url.hostname },
    });

    const ws = new WebSocket(this.opts.wsUrl, {
      headers: signed.headers as Record<string, string>,
    });
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onUnexpected = (_req: unknown, res: { statusCode?: number; statusMessage?: string }) => {
        cleanup();
        reject(
          new Error(
            `AgentCore browser upgrade rejected: ${res.statusCode ?? "?"} ${res.statusMessage ?? ""}`.trim(),
          ),
        );
      };
      const cleanup = () => {
        ws.off("open", onOpen);
        ws.off("error", onError);
        ws.off("unexpected-response", onUnexpected);
      };
      ws.on("open", onOpen);
      ws.on("error", onError);
      ws.on("unexpected-response", onUnexpected);
    });

    ws.on("message", (raw) => this.onMessage(raw.toString()));
    ws.on("close", () => this.failAllPending(new Error("AgentCore browser socket closed")));
  }

  private onMessage(raw: string): void {
    let msg: {
      id?: number;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: { message?: string };
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof msg.id === "number") {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.error) {
        pending.reject(new CdpError(msg.error.message ?? "CDP error", pending.method));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    if (msg.method) {
      const handlers = this.eventHandlers.get(msg.method);
      if (handlers) for (const h of handlers) h(msg.params);
    }
  }

  private failAllPending(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  on(method: string, handler: (params: unknown) => void): () => void {
    let set = this.eventHandlers.get(method);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(method, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    if (!this.ws || this.closed) {
      return Promise.reject(new CdpError("CDP client is not connected", method));
    }
    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CdpError(`CDP call timed out after ${this.timeout}ms`, method));
      }, this.timeout);

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
        method,
      });
      this.ws!.send(JSON.stringify(payload));
    });
  }

  private get timeout(): number {
    return this.opts.commandTimeoutMs ?? 30_000;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.failAllPending(new Error("CDP client closed"));
    this.ws?.close();
  }
}

/**
 * Amazon Bedrock Converse provider.
 *
 * This is the intended production path and the default the code is written around.
 * It is not the provider the public demo runs on, because account 756590016817 is
 * under an account-level Bedrock restriction that returns
 * `ValidationException: Error 002` for every model including Amazon Nova. That is an
 * account state, not a design choice, and it is documented in docs/adr/0002 rather
 * than papered over.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { allowedActions } from "../personas.js";
import {
  ACTION_TOOL_DESCRIPTION,
  ACTION_TOOL_NAME,
  actionToolSchema,
  buildSystemPrompt,
  coerceAction,
  type ReasoningProvider,
  type ReasoningRequest,
  type ReasoningResult,
} from "../reasoning.js";

export const DEFAULT_BEDROCK_MODEL =
  process.env.BUYABLE_BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

/** Published on-demand rates, USD per million tokens. Labelled as list price, not measured. */
const BEDROCK_RATES: Record<string, { input: number; output: number }> = {
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": { input: 3, output: 15 },
  "us.anthropic.claude-sonnet-5": { input: 2, output: 10 },
  "us.anthropic.claude-haiku-4-5-20251001-v1:0": { input: 1, output: 5 },
};

export class BedrockProvider implements ReasoningProvider {
  readonly id: string;
  private client: BedrockRuntimeClient;

  constructor(
    private readonly region: string,
    private readonly modelId: string = DEFAULT_BEDROCK_MODEL,
  ) {
    this.id = `bedrock:${modelId}`;
    this.client = new BedrockRuntimeClient({
      region,
      // Pinned to HTTP/1.1. The SDK prefers HTTP/2 for Bedrock, which fails behind a
      // TLS-inspecting corporate proxy with "http2 request did not get a response".
      requestHandler: new NodeHttpHandler({ connectionTimeout: 10_000, requestTimeout: 120_000 }),
    });
  }

  estimateCostUsd(inputTokens: number, outputTokens: number): number {
    const rate = BEDROCK_RATES[this.modelId] ?? BEDROCK_RATES[DEFAULT_BEDROCK_MODEL]!;
    return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  }

  private tool(request: ReasoningRequest): Tool {
    return {
      toolSpec: {
        name: ACTION_TOOL_NAME,
        description: ACTION_TOOL_DESCRIPTION,
        inputSchema: {
          // The Bedrock types model tool schemas as DocumentType, which is structurally
          // the same JSON Schema object the Anthropic provider passes.
          json: actionToolSchema(request.persona, allowedActions(request.persona)) as never,
        },
      },
    };
  }

  async decide(request: ReasoningRequest): Promise<ReasoningResult> {
    const content: ContentBlock[] = [{ text: request.observationText }];
    if (request.screenshotBase64 && request.persona.perceive.vision) {
      content.push({
        image: { format: "png", source: { bytes: Buffer.from(request.screenshotBase64, "base64") } },
      });
    }

    const messages: Message[] = [
      ...request.history.map<Message>((turn) => ({
        role: turn.role,
        content: [{ text: turn.text }],
      })),
      { role: "user", content },
    ];

    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: buildSystemPrompt(request.persona, request.goal) }],
        messages,
        toolConfig: { tools: [this.tool(request)], toolChoice: { any: {} } },
        inferenceConfig: { maxTokens: 1500, temperature: 0 },
      }),
    );

    const blocks = response.output?.message?.content ?? [];
    const toolUse = blocks.find((b) => "toolUse" in b && b.toolUse)?.toolUse;
    const narration = blocks
      .map((b) => ("text" in b && b.text ? b.text : ""))
      .join("\n")
      .trim();

    return {
      action: coerceAction((toolUse?.input as Record<string, unknown>) ?? {}, narration),
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      narration,
    };
  }
}

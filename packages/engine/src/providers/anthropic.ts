/**
 * Anthropic Messages API provider.
 *
 * Same interface, same system prompt, same tool schema as the Bedrock provider, so
 * the persona constraints and the resulting verdict are unchanged by which endpoint
 * answers. That equivalence is the point of the seam: if swapping the provider
 * changed the verdict, the verdict would be measuring the model rather than the site.
 */

import Anthropic from "@anthropic-ai/sdk";
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

export const DEFAULT_ANTHROPIC_MODEL =
  process.env.BUYABLE_ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";

/** Published list price, USD per million tokens. */
const ANTHROPIC_RATES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export class AnthropicProvider implements ReasoningProvider {
  readonly id: string;
  private client: Anthropic;

  constructor(apiKey: string, private readonly modelId: string = DEFAULT_ANTHROPIC_MODEL) {
    this.id = `anthropic:${modelId}`;
    this.client = new Anthropic({ apiKey, maxRetries: 3 });
  }

  estimateCostUsd(inputTokens: number, outputTokens: number): number {
    const rate = ANTHROPIC_RATES[this.modelId] ?? ANTHROPIC_RATES[DEFAULT_ANTHROPIC_MODEL]!;
    return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  }

  async decide(request: ReasoningRequest): Promise<ReasoningResult> {
    const content: Anthropic.ContentBlockParam[] = [
      { type: "text", text: request.observationText },
    ];
    if (request.screenshotBase64 && request.persona.perceive.vision) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: request.screenshotBase64 },
      });
    }

    const messages: Anthropic.MessageParam[] = [
      ...request.history.map<Anthropic.MessageParam>((turn) => ({
        role: turn.role,
        content: turn.text,
      })),
      { role: "user", content },
    ];

    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 1500,
      temperature: 0,
      system: buildSystemPrompt(request.persona, request.goal),
      tools: [
        {
          name: ACTION_TOOL_NAME,
          description: ACTION_TOOL_DESCRIPTION,
          input_schema: actionToolSchema(
            request.persona,
            allowedActions(request.persona),
          ) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "any" },
      messages,
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const narration = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    return {
      action: coerceAction((toolUse?.input as Record<string, unknown>) ?? {}, narration),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      narration,
    };
  }
}

/**
 * Groq provider.
 *
 * Same interface, same system prompt, same generated tool schema as the others, so
 * nothing about the persona constraints changes when this one is selected.
 *
 * A caution that belongs in the code rather than only in a document. Buyable's
 * central finding is a *behaviour*: the assistive persona stops at a control it
 * cannot identify instead of guessing. That behaviour is a property of the model, not
 * of this harness, and a weaker model can fail it in a way that looks like success.
 * If it starts guessing past unlabelled controls, the assistive persona completes
 * journeys it should not, and the verdict quietly becomes wrong rather than loudly
 * becoming unavailable.
 *
 * So this provider is not interchangeable on trust. `npm run validate:provider`
 * checks it against the fixture with a known answer, and until that passes the
 * numbers it produces should not be published.
 */

import Groq from "groq-sdk";
import { allowedActions } from "../personas.js";
import {
  ACTION_TOOL_DESCRIPTION,
  ACTION_TOOL_NAME,
  actionToolSchema,
  buildFixPrompt,
  buildSystemPrompt,
  coerceAction,
  coerceFix,
  FIX_TOOL_DESCRIPTION,
  FIX_TOOL_NAME,
  FIX_TOOL_SCHEMA,
  type FixProposalRequest,
  type FixProposalResult,
  type ReasoningProvider,
  type ReasoningRequest,
  type ReasoningResult,
} from "../reasoning.js";

/**
 * Default model.
 *
 * Chosen for tool-use reliability over raw speed, because one malformed tool call
 * costs a whole turn and the loop detector then counts it as no progress.
 */
export const DEFAULT_GROQ_MODEL = process.env.BUYABLE_GROQ_MODEL ?? "qwen/qwen3.8-27b";

/** Published list price, USD per million tokens. */
const GROQ_RATES: Record<string, { input: number; output: number }> = {
  "openai/gpt-oss-120b": { input: 0.15, output: 0.75 },
  "openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
  "qwen/qwen3.8-27b": { input: 0.29, output: 0.59 },
};

export class GroqProvider implements ReasoningProvider {
  readonly id: string;
  private client: Groq;

  constructor(apiKey: string, private readonly modelId: string = DEFAULT_GROQ_MODEL) {
    this.id = `groq:${modelId}`;
    this.client = new Groq({ apiKey, maxRetries: 3 });
  }

  estimateCostUsd(inputTokens: number, outputTokens: number): number {
    const rate = GROQ_RATES[this.modelId] ?? GROQ_RATES[DEFAULT_GROQ_MODEL]!;
    return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  }

  async decide(request: ReasoningRequest): Promise<ReasoningResult> {
    // No image content. The models available here are weaker at vision than at text,
    // and a baseline control that misreads a screenshot is worse than one working
    // from the DOM summary it also receives.
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: buildSystemPrompt(request.persona, request.goal) },
      ...request.history.map<Groq.Chat.ChatCompletionMessageParam>((turn) => ({
        role: turn.role === "assistant" ? "assistant" : "user",
        content: turn.text,
      })),
      { role: "user", content: request.observationText },
    ];

    const response = await this.client.chat.completions.create({
      model: this.modelId,
      messages,
      temperature: 0,
      max_tokens: 1500,
      tools: [
        {
          type: "function",
          function: {
            name: ACTION_TOOL_NAME,
            description: ACTION_TOOL_DESCRIPTION,
            parameters: actionToolSchema(request.persona, allowedActions(request.persona)),
          },
        },
      ],
      tool_choice: "required",
    });

    const choice = response.choices[0];
    const call = choice?.message?.tool_calls?.[0];
    const narration = choice?.message?.content?.trim() ?? "";

    let input: Record<string, unknown> = {};
    if (call?.function?.arguments) {
      try {
        input = JSON.parse(call.function.arguments) as Record<string, unknown>;
      } catch {
        // A malformed tool call is a lost turn, not a crash. Returning blocked here
        // would misattribute a model failure to the site, so the action is left to
        // coerceAction, which records it honestly.
      }
    }

    return {
      action: coerceAction(input, narration),
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      narration,
    };
  }

  async proposeFix(request: FixProposalRequest): Promise<FixProposalResult> {
    const response = await this.client.chat.completions.create({
      model: this.modelId,
      temperature: 0,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "You repair accessibility barriers in source code. You make the smallest change that removes the barrier and nothing else.",
        },
        { role: "user", content: buildFixPrompt(request) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: FIX_TOOL_NAME,
            description: FIX_TOOL_DESCRIPTION,
            parameters: FIX_TOOL_SCHEMA,
          },
        },
      ],
      tool_choice: "required",
    });

    const call = response.choices[0]?.message?.tool_calls?.[0];
    let input: Record<string, unknown> = {};
    if (call?.function?.arguments) {
      try {
        input = JSON.parse(call.function.arguments) as Record<string, unknown>;
      } catch {
        // An unparseable proposal fails the anchor check, which is the right place
        // for it to fail: loudly, before anything is applied.
      }
    }

    return {
      ...coerceFix(input),
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  }
}

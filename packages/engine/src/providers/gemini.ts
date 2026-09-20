/**
 * Google Gemini provider.
 *
 * The closest match to what Buyable needs among the options with a free tier: real
 * function calling that can be forced to exactly one call per turn, native vision for
 * the baseline control, and Flash models that are frontier-class rather than mid-tier.
 *
 * The binding constraint is quota rather than capability. A single persona attempt
 * costs twenty to thirty-four model calls, and the free tier allows roughly twenty
 * requests a day on the capable Flash models, so free Gemini is enough to validate
 * and demonstrate and nowhere near enough to run a public scanner. Flash-Lite has a
 * far higher daily allowance and is the weakest tier, which is exactly the trade that
 * `tools/validate-provider.mjs` exists to adjudicate rather than assume.
 *
 * As with every provider here: passing validation is a precondition for publishing
 * anything it produces. Buyable's central finding is that the assistive persona stops
 * at a control it cannot identify instead of guessing, and that is a property of the
 * model. A weaker one fails it by succeeding, which is the dangerous direction.
 */

import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type FunctionDeclaration,
  type Schema,
} from "@google/genai";
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
 * `gemini-3.8-flash` rather than a Flash-Lite, on evidence. Asked, as the assistive
 * persona, what to do with a checkout whose only control was a button with no
 * accessible name, `gemini-flash-lite-latest` pressed it anyway and explained it was
 * "activating the unnamed button to proceed with the checkout". `gemini-3.8-flash`
 * refused and said why. The cheaper model has roughly twenty-five times the daily
 * allowance and cannot be used, because a model that guesses past unlabelled controls
 * reports disabled shoppers completing purchases they cannot complete.
 */
export const DEFAULT_GEMINI_MODEL = process.env.BUYABLE_GEMINI_MODEL ?? "gemini-3.8-flash";

/** Published list price, USD per million tokens. Free tier bills nothing and caps instead. */
const GEMINI_RATES: Record<string, { input: number; output: number }> = {
  "gemini-flash-latest": { input: 0.3, output: 2.5 },
  "gemini-flash-lite-latest": { input: 0.1, output: 0.4 },
  "gemini-3.8-flash": { input: 0.3, output: 2.5 },
  "gemini-3.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
};

/**
 * Translate our JSON Schema into Gemini's dialect.
 *
 * Gemini wants an enum of its own `Type` values rather than the JSON Schema strings,
 * and rejects several keywords it does not recognise. Converting here keeps a single
 * schema definition shared by every provider, so a persona's permitted actions cannot
 * drift between them, which would make results incomparable.
 */
function toGeminiSchema(schema: Record<string, unknown>): Schema {
  const kind = (t: unknown): Type => {
    switch (t) {
      case "string":
        return Type.STRING;
      case "integer":
        return Type.INTEGER;
      case "number":
        return Type.NUMBER;
      case "boolean":
        return Type.BOOLEAN;
      case "array":
        return Type.ARRAY;
      default:
        return Type.OBJECT;
    }
  };

  const convert = (node: Record<string, unknown>): Schema => {
    const out: Record<string, unknown> = { type: kind(node.type) };
    if (typeof node.description === "string") out.description = node.description;
    if (Array.isArray(node.enum)) out.enum = node.enum.map(String);

    if (node.type === "object" && node.properties) {
      const props: Record<string, Schema> = {};
      for (const [key, value] of Object.entries(node.properties as Record<string, unknown>)) {
        props[key] = convert(value as Record<string, unknown>);
      }
      out.properties = props;
      if (Array.isArray(node.required)) out.required = node.required.map(String);
    }
    if (node.type === "array" && node.items) {
      out.items = convert(node.items as Record<string, unknown>);
    }
    return out as Schema;
  };

  return convert(schema);
}

export class GeminiProvider implements ReasoningProvider {
  readonly id: string;
  private client: GoogleGenAI;

  constructor(apiKey: string, private readonly modelId: string = DEFAULT_GEMINI_MODEL) {
    this.id = `gemini:${modelId}`;
    this.client = new GoogleGenAI({ apiKey });
  }

  estimateCostUsd(inputTokens: number, outputTokens: number): number {
    const rate = GEMINI_RATES[this.modelId] ?? GEMINI_RATES[DEFAULT_GEMINI_MODEL]!;
    return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  }

  async decide(request: ReasoningRequest): Promise<ReasoningResult> {
    const declaration: FunctionDeclaration = {
      name: ACTION_TOOL_NAME,
      description: ACTION_TOOL_DESCRIPTION,
      parameters: toGeminiSchema(
        actionToolSchema(request.persona, allowedActions(request.persona)),
      ),
    };

    const parts: Array<Record<string, unknown>> = [{ text: request.observationText }];
    if (request.screenshotBase64 && request.persona.perceive.vision) {
      parts.push({ inlineData: { mimeType: "image/png", data: request.screenshotBase64 } });
    }

    const contents = [
      ...request.history.map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.text }],
      })),
      { role: "user", parts },
    ];

    const response = await this.client.models.generateContent({
      model: this.modelId,
      contents,
      config: {
        systemInstruction: buildSystemPrompt(request.persona, request.goal),
        temperature: 0,
        maxOutputTokens: 1500,
        tools: [{ functionDeclarations: [declaration] }],
        // ANY forces a function call, which is how every other provider here is
        // configured. Without it the model can answer in prose and lose the turn.
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: [ACTION_TOOL_NAME],
          },
        },
      },
    });

    const call = response.functionCalls?.[0];
    // Reading .text when the response is a function call makes the SDK warn about
    // concatenating non-text parts, on every single turn. The narration is optional,
    // so only reach for it when there is actually text to read.
    const narration = call ? "" : (response.text ?? "").trim();

    return {
      action: coerceAction((call?.args as Record<string, unknown>) ?? {}, narration),
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      narration,
    };
  }

  async proposeFix(request: FixProposalRequest): Promise<FixProposalResult> {
    const declaration: FunctionDeclaration = {
      name: FIX_TOOL_NAME,
      description: FIX_TOOL_DESCRIPTION,
      parameters: toGeminiSchema(FIX_TOOL_SCHEMA),
    };

    const response = await this.client.models.generateContent({
      model: this.modelId,
      contents: [{ role: "user", parts: [{ text: buildFixPrompt(request) }] }],
      config: {
        systemInstruction:
          "You repair accessibility barriers in source code. You make the smallest change that removes the barrier and nothing else.",
        temperature: 0,
        maxOutputTokens: 2000,
        tools: [{ functionDeclarations: [declaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: [FIX_TOOL_NAME],
          },
        },
      },
    });

    const call = response.functionCalls?.[0];
    return {
      ...coerceFix((call?.args as Record<string, unknown>) ?? {}),
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}

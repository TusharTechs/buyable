/**
 * Provider selection.
 *
 * Order of preference: whatever BUYABLE_PROVIDER names, then Bedrock if the account
 * can actually invoke it, then Anthropic. Selection is explicit and logged, because
 * every evidence bundle records which provider produced the verdict and a report
 * that cannot say what decided it is not evidence.
 */

import type { ReasoningProvider } from "../reasoning.js";
import { AnthropicProvider } from "./anthropic.js";
import { BedrockProvider } from "./bedrock.js";
import { GroqProvider } from "./groq.js";

export { AnthropicProvider, BedrockProvider, GroqProvider };

export interface ProviderOptions {
  region: string;
  /** "bedrock" | "anthropic" | "groq". Defaults to the BUYABLE_PROVIDER variable. */
  provider?: string;
  anthropicApiKey?: string;
  groqApiKey?: string;
  modelId?: string;
}

export function createProvider(opts: ProviderOptions): ReasoningProvider {
  const choice = (opts.provider ?? process.env.BUYABLE_PROVIDER ?? "anthropic").toLowerCase();

  if (choice === "bedrock") {
    return new BedrockProvider(opts.region, opts.modelId);
  }

  if (choice === "groq") {
    const groqKey = opts.groqApiKey ?? process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error("BUYABLE_PROVIDER=groq but GROQ_API_KEY is not set.");
    return new GroqProvider(groqKey, opts.modelId);
  }

  const key = opts.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "No reasoning provider available. Set ANTHROPIC_API_KEY or GROQ_API_KEY, or set BUYABLE_PROVIDER=bedrock on an account whose Bedrock access is not restricted.",
    );
  }
  return new AnthropicProvider(key, opts.modelId);
}

/**
 * Probe a provider cheaply so a run fails in the first second with a clear message
 * rather than three minutes in, after a browser session has already been billed.
 */
export async function assertProviderWorks(provider: ReasoningProvider): Promise<void> {
  const { PERSONAS } = await import("../personas.js");
  await provider.decide({
    persona: PERSONAS.assistive,
    goal: "Confirm the provider is reachable.",
    history: [],
    observationText:
      "STEP 0\nURL: about:blank\nTITLE: probe\n\nACCESSIBILITY TREE (reading order, 0 nodes, 0 focusable):\n(empty)\n\nFOCUS: nothing is focused.\n\nThis is a connectivity probe. Respond with the blocked action.",
  });
}

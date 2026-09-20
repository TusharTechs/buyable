/**
 * Provider selection.
 *
 * Two providers remain: Amazon Bedrock, which is the intended production path, and
 * Google Gemini, which is what this account can actually invoke. See ADR 0002.
 *
 * The seam itself is worth more than the number of implementations behind it. It
 * started as a contingency and became the thing that keeps results honest, because
 * Buyable's central finding is a behaviour rather than a capability: the assistive
 * persona stops at a control it cannot identify instead of guessing. That behaviour
 * belongs to the model. A weaker one fails by *succeeding*, reporting disabled
 * shoppers completing purchases they cannot complete, and nothing about that looks
 * broken from the outside.
 *
 * So this is not a place where components are freely interchangeable. It is a place
 * where each one has to earn its way in, and `tools/validate-provider.mjs` is the
 * gate. Four models have been measured against the same fixture; the two that were
 * rejected are recorded in ADR 0002 rather than forgotten.
 */

import type { ReasoningProvider } from "../reasoning.js";
import { BedrockProvider } from "./bedrock.js";
import { GeminiProvider } from "./gemini.js";

export { BedrockProvider, GeminiProvider };

export interface ProviderOptions {
  region: string;
  /** "bedrock" | "gemini". Defaults to the BUYABLE_PROVIDER environment variable. */
  provider?: string;
  geminiApiKey?: string;
  modelId?: string;
}

export function createProvider(opts: ProviderOptions): ReasoningProvider {
  const choice = (opts.provider ?? process.env.BUYABLE_PROVIDER ?? "gemini").toLowerCase();

  if (choice === "bedrock") {
    return new BedrockProvider(opts.region, opts.modelId);
  }

  if (choice !== "gemini") {
    throw new Error(
      `Unknown provider "${choice}". Supported: bedrock, gemini. Whichever is chosen must first pass tools/validate-provider.mjs.`,
    );
  }

  const key = opts.geminiApiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      "No reasoning provider available. Set GEMINI_API_KEY, or set BUYABLE_PROVIDER=bedrock on an account whose Bedrock access is not restricted.",
    );
  }
  return new GeminiProvider(key, opts.modelId);
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

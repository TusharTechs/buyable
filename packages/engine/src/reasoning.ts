/**
 * The reasoning provider seam.
 *
 * Buyable's decision layer is one narrow interface: given an observation and a
 * persona, return one action. Amazon Bedrock is the provider used in production and
 * in the submission. The seam exists because the perception and actuation layers are
 * the interesting part of this system and they should not be hostage to a single
 * model endpoint being reachable.
 *
 * A useful side effect: swapping providers is how we show that the persona
 * constraints, not the model, are what produce the verdict.
 */

import type { Action, Persona } from "./types.js";

export interface ReasoningRequest {
  persona: Persona;
  goal: string;
  /** Prior turns, oldest first, already trimmed by the caller. */
  history: ReasoningTurn[];
  observationText: string;
  /** Only supplied when the persona is allowed vision. */
  screenshotBase64?: string;
}

export interface ReasoningTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ReasoningResult {
  action: Action;
  inputTokens: number;
  outputTokens: number;
  /** Any prose the model produced alongside the tool call, kept for the evidence bundle. */
  narration: string;
}

export interface ReasoningProvider {
  /** Stable identifier written into every evidence bundle, so a report says what decided it. */
  readonly id: string;
  /** Cost of a run, in USD. Providers that cannot price themselves return 0. */
  estimateCostUsd(inputTokens: number, outputTokens: number): number;
  decide(request: ReasoningRequest): Promise<ReasoningResult>;
}

/**
 * The tool schema handed to whichever provider is in play.
 *
 * Generated from the persona's capabilities rather than written out per persona, so
 * a persona that cannot use a pointer is never offered `click_selector`. Constraining
 * the schema rather than the prose is deliberate: a prompt instruction can be argued
 * with, a JSON schema cannot.
 */
export function actionToolSchema(persona: Persona, allowed: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      action: { type: "string", enum: allowed, description: "The single action to take." },
      reason: {
        type: "string",
        description: "One short sentence on why this action moves you toward the goal.",
      },
      ref: { type: "integer", description: "Accessibility node reference, for click_node and fill_node." },
      selector: { type: "string", description: "CSS selector, for click_selector." },
      text: { type: "string", description: "Text to enter, for type and fill_node." },
      key: {
        type: "string",
        enum: [
          "Enter",
          "Space",
          "Escape",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "Backspace",
        ],
        description: "Key to press, for press.",
      },
      url: { type: "string", description: "URL, for navigate." },
      blockedExplanation: {
        type: "string",
        description:
          "Only for `blocked`. State exactly what you could not determine from what you were given, naming the node reference if there is one. Describe the missing information, not a guess at the cause.",
      },
    },
    required: ["action", "reason"],
    ...(persona.perceive.vision ? {} : {}),
  };
}

export const ACTION_TOOL_NAME = "act";

export const ACTION_TOOL_DESCRIPTION =
  "Take exactly one action on the page. Call this once per turn. If you have achieved the goal, use action `finish`. If you genuinely cannot proceed, use action `blocked` and explain precisely what information you were missing.";

/** Shared prompt, so every provider reasons under identical instructions. */
export function buildSystemPrompt(persona: Persona, goal: string): string {
  const lines = [
    `You are attempting to complete a real task on a live website.`,
    ``,
    `YOUR GOAL: ${goal}`,
    ``,
    `YOU ARE: ${persona.standsFor}`,
    `HOW YOU PERCEIVE THIS PAGE: ${persona.description}`,
    ``,
  ];

  if (persona.perceive.accessibilityTree && !persona.perceive.vision) {
    lines.push(
      `You cannot see the page. You receive only the accessibility tree, which is what a`,
      `screen reader speaks aloud. An entry rendered as "(no accessible name)" means the`,
      `control announces nothing: you genuinely do not know what it does. Do not guess from`,
      `position, ordering or surrounding text, because a real screen reader user could not`,
      `either. Guessing would make this test worthless.`,
      ``,
    );
  }
  if (!persona.act.pointer) {
    lines.push(
      `You have no mouse and no CSS selectors. You move focus with tab and shift_tab, and`,
      `activate the focused control with press Enter or press Space.`,
      ``,
    );
  }

  lines.push(
    `RULES:`,
    `1. Take exactly one action per turn by calling the ${ACTION_TOOL_NAME} tool.`,
    `2. Work toward the goal directly. Do not explore unnecessarily.`,
    `3. Use finish only when you believe the goal is genuinely complete.`,
    `4. Use blocked when you cannot proceed with the information available to you.`,
    `   Being blocked is a valid and useful result. It is not a failure on your part.`,
    `   Explain precisely what you could not determine.`,
    `5. Never invent information you were not given.`,
  );
  return lines.join("\n");
}

/** Normalise whatever the provider returned into an Action, tolerating partial output. */
export function coerceAction(input: Record<string, unknown>, narration: string): Action {
  const name = typeof input.action === "string" ? input.action : "blocked";
  return {
    action: name as Action["action"],
    reason: typeof input.reason === "string" ? input.reason : "",
    ref: typeof input.ref === "number" ? input.ref : undefined,
    selector: typeof input.selector === "string" ? input.selector : undefined,
    text: typeof input.text === "string" ? input.text : undefined,
    key: typeof input.key === "string" ? input.key : undefined,
    url: typeof input.url === "string" ? input.url : undefined,
    blockedExplanation:
      typeof input.blockedExplanation === "string" ? input.blockedExplanation : narration || undefined,
  };
}

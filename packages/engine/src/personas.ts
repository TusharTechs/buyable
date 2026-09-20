/**
 * The three personas.
 *
 * A persona is not a prompt. It is a hard constraint on what the model can perceive
 * and what it is physically able to do, enforced in the tool layer rather than
 * requested in English. A model cannot "try harder" past a constraint it has no
 * tool for, which is what makes the comparison between personas meaningful.
 *
 * Baseline exists to be the control. If baseline completes the journey and assistive
 * does not, the variable is the site, not the model. Every claim Buyable makes rests
 * on that one piece of experimental hygiene.
 */

import type { Persona, PersonaId } from "./types.js";

export const PERSONAS: Record<PersonaId, Persona> = {
  baseline: {
    id: "baseline",
    label: "Baseline",
    description:
      "Sees the rendered page and the DOM, and clicks wherever it likes. This is the control condition.",
    standsFor: "A sighted customer using a mouse, with no assistive technology.",
    perceive: { dom: true, vision: true, accessibilityTree: false, structuredData: true },
    act: { pointer: true, keyboard: true, accessibilityNodeRef: false, quickNav: false },
    maxSteps: 32,
  },

  assistive: {
    id: "assistive",
    label: "Assistive",
    description:
      "Perceives only the accessibility tree and moves only by keyboard, including the quick navigation a screen reader provides. No pixels, no CSS selectors, no pointer.",
    standsFor:
      "A customer using a screen reader, or anyone who cannot use a mouse and navigates by Tab and Enter.",
    perceive: { dom: false, vision: false, accessibilityTree: true, structuredData: false },
    act: { pointer: false, keyboard: true, accessibilityNodeRef: false, quickNav: true },
    // Raised from 34 after a real retail search page, with 159 tab stops, exhausted
    // the budget while still navigating normally. A real screen reader user has no
    // step limit, and ours should not be tight enough to look like a site's fault.
    maxSteps: 48,
  },

  agent: {
    id: "agent",
    label: "AI agent",
    description:
      "Perceives the accessibility tree plus structured data, and activates elements by accessibility node reference.",
    standsFor:
      "An AI shopping agent acting for a customer, which reads the same accessibility tree a screen reader does.",
    perceive: { dom: false, vision: false, accessibilityTree: true, structuredData: true },
    act: { pointer: false, keyboard: true, accessibilityNodeRef: true, quickNav: true },
    maxSteps: 40,
  },
};

export function getPersona(id: PersonaId): Persona {
  const p = PERSONAS[id];
  if (!p) throw new Error(`Unknown persona: ${id}`);
  return p;
}

/**
 * The action vocabulary a persona is allowed to use, derived from its capabilities.
 * This list is also what gets rendered into the tool schema handed to the model,
 * so the constraint and the prompt can never drift apart.
 */
export function allowedActions(persona: Persona): string[] {
  const actions = ["read", "press", "finish", "blocked"];
  if (persona.act.keyboard) actions.push("tab", "shift_tab", "type");
  if (persona.act.quickNav) {
    actions.push("next_heading", "next_button", "next_link", "next_form_field", "next_landmark");
  }
  if (persona.act.pointer) actions.push("click_selector", "navigate");
  if (persona.act.accessibilityNodeRef) actions.push("click_node", "fill_node");
  return actions;
}

/**
 * Core domain types for Buyable.
 *
 * The single idea this file encodes: a journey either COMPLETES or it does not.
 * Everything else (violations, scores, warnings) is evidence for that verdict,
 * never a substitute for it.
 */

/** The three ways a journey gets attempted. */
export type PersonaId = "baseline" | "assistive" | "agent";

export const PERSONA_IDS: PersonaId[] = ["baseline", "assistive", "agent"];

/** What a persona is allowed to perceive. */
export interface PerceptionCapabilities {
  /** Full rendered DOM including text nodes and CSS selectors. */
  dom: boolean;
  /** Pixels. Screenshots for the model to look at. */
  vision: boolean;
  /** The Chrome accessibility tree, which is what screen readers and agents consume. */
  accessibilityTree: boolean;
  /** JSON-LD / microdata, which is what shopping agents lean on for product facts. */
  structuredData: boolean;
}

/** What a persona is allowed to do. */
export interface ActionCapabilities {
  /** Click by CSS selector or coordinate. Sighted-mouse behaviour. */
  pointer: boolean;
  /** Tab / Shift-Tab / Enter / Space / arrows. Keyboard-only behaviour. */
  keyboard: boolean;
  /** Activate an element by its accessibility-tree node id, the way an agent does. */
  accessibilityNodeRef: boolean;
  /**
   * Screen reader quick navigation: jump to the next heading, button, link, form
   * field or landmark. NVDA and JAWS bind these to H, B, K, F and D; VoiceOver
   * exposes them through the rotor. Modelling them matters because a real screen
   * reader user does not tab through a page one control at a time, and a naive tab
   * loop would make every site look worse than it is.
   */
  quickNav: boolean;
}

export interface Persona {
  id: PersonaId;
  label: string;
  /** One line a judge or a buyer can understand without context. */
  description: string;
  /** Who in the real world this persona stands in for. */
  standsFor: string;
  perceive: PerceptionCapabilities;
  act: ActionCapabilities;
  /** Hard ceiling on model turns, to bound cost and runtime. */
  maxSteps: number;
}

/** How we decide, independently of the model, whether the journey actually finished. */
export interface SuccessAssertion {
  /** Regex tested against the final URL. */
  urlMatches?: string;
  /** Case-insensitive substring that must appear in the rendered page text. */
  textPresent?: string;
  /** Case-insensitive substring that must NOT appear (for example an error banner). */
  textAbsent?: string;
}

export interface Journey {
  journeyId: string;
  /** Human label, for example "Buy the cheapest blue running shoe in size 9". */
  name: string;
  startUrl: string;
  /** Plain-English goal handed to the model. */
  goal: string;
  assertion: SuccessAssertion;
  /** Optional repo coordinates, needed only for the fix-and-reverify loop. */
  repo?: { owner: string; name: string; defaultBranch: string };
  createdAt: string;
}

/** A single accessibility-tree node, normalised down to what actually matters. */
export interface AxNode {
  /** Stable within one page snapshot. What the agent persona references. */
  ref: number;
  role: string;
  /** The accessible name. Empty string means "this control announces nothing". */
  name: string;
  value?: string;
  /** Extra state a screen reader would speak: disabled, checked, expanded, required, invalid. */
  states: string[];
  /** True when the node can receive keyboard focus. */
  focusable: boolean;
  /** Depth in the reading order, used for indentation only. */
  depth: number;
  /** CDP backend node id, used to resolve back to the DOM for clicks and for patching. */
  backendNodeId?: number;
}

/** What the model receives on each turn, shaped by the persona's perception limits. */
export interface Observation {
  step: number;
  url: string;
  title: string;
  /** Present when the persona can see the accessibility tree. */
  axNodes?: AxNode[];
  /** Ref of the currently focused node, when keyboard navigation is in play. */
  focusedRef?: number;
  /** What a screen reader would have spoken since the last turn. */
  announcements?: string[];
  /** Present when the persona has DOM perception. */
  domSummary?: string;
  /** Present when the persona has vision. Base64 PNG. */
  screenshotBase64?: string;
  /** Present when the persona reads structured data. */
  structuredData?: unknown[];
  /** Set when the previous action failed, so the model can react. */
  lastActionError?: string;
}

export type ActionName =
  | "tab"
  | "shift_tab"
  | "next_heading"
  | "next_button"
  | "next_link"
  | "next_form_field"
  | "next_landmark"
  | "press"
  | "type"
  | "click_selector"
  | "click_node"
  | "fill_node"
  | "navigate"
  | "read"
  | "finish"
  | "blocked";

export interface Action {
  action: ActionName;
  /** Model's own words about why it is doing this. Shown in the evidence bundle. */
  reason: string;
  selector?: string;
  ref?: number;
  text?: string;
  key?: string;
  url?: string;
  /** Only for `blocked`: the model's account of what it could not determine. */
  blockedExplanation?: string;
}

export interface StepRecord {
  step: number;
  observationDigest: string;
  action: Action;
  error?: string;
  url: string;
  focusedRef?: number;
  /** ms since run start */
  at: number;
  /**
   * Set when this step activated a control with no accessible name.
   *
   * A screen reader user cannot do this: not knowing what a control does is the
   * reason they stop. An AI agent can and does, because it is willing to act on an
   * inference drawn from surrounding context. Recording it separately matters,
   * because "the agent finished" and "the agent finished by gambling on an
   * unidentifiable control during payment" are very different facts about a site.
   */
  blindActivation?: {
    role: string;
    selector?: string;
    /** The model's stated reason, which is the inference it acted on. */
    inferredPurpose: string;
  };
}

export type RunOutcome =
  /** The independent assertion passed. The journey really finished. */
  | "completed"
  /** The persona ran out of steps without finishing. */
  | "exhausted"
  /** The model declared itself unable to proceed. */
  | "blocked"
  /** The model claimed done but the independent assertion failed. */
  | "false_completion"
  /** Infrastructure fell over. Not the site's fault, and never counted against it. */
  | "error";

/** The node that stopped a persona, with enough context to write a patch. */
export interface Blocker {
  /** Which persona hit it. */
  persona: PersonaId;
  step: number;
  url: string;
  /** The accessibility node the persona was stuck on, when identifiable. */
  node?: AxNode;
  /** CSS path to the element, resolved from the AX node. */
  selector?: string;
  /** Outer HTML of the offending element, trimmed. */
  outerHtml?: string;
  /** Machine classification, for example "control-without-accessible-name". */
  kind: BlockerKind;
  /** WCAG success criteria this maps to, for example ["4.1.2"]. */
  wcag: string[];
  /** The model's own words, verbatim. This is the most persuasive artifact we have. */
  agentExplanation: string;
}

export type BlockerKind =
  | "control-without-accessible-name"
  | "non-semantic-interactive-element"
  | "unreachable-by-keyboard"
  | "focus-trap"
  | "form-field-without-label"
  | "empty-link"
  | "state-not-exposed"
  | "unknown";

export interface PersonaRunResult {
  persona: PersonaId;
  outcome: RunOutcome;
  /** True only when the independent assertion passed. */
  completed: boolean;
  steps: StepRecord[];
  blocker?: Blocker;
  startedAt: string;
  durationMs: number;
  /** Cost accounting, so the dashboard can show cost per proof. */
  inputTokens: number;
  outputTokens: number;
  /** AgentCore browser session id, for traceability. */
  browserSessionId?: string;
  finalUrl?: string;
  errorMessage?: string;
  /** Steps where the persona activated a control it could not identify. */
  blindActivations: NonNullable<StepRecord["blindActivation"]>[];
}

/**
 * One persona attempted n times. Reported as a fraction so a single flaky run
 * can never produce a false accusation against a site.
 */
export interface PersonaVerdict {
  persona: PersonaId;
  attempts: number;
  completions: number;
  /** completions / attempts */
  rate: number;
  runs: PersonaRunResult[];
  blocker?: Blocker;
  /**
   * Completions that required activating at least one unidentifiable control.
   * A completion of this kind is reported, never quietly counted as a clean pass.
   */
  completionsWithBlindActivation: number;
  blindActivations: NonNullable<StepRecord["blindActivation"]>[];
}

export interface JourneyReport {
  reportId: string;
  journeyId: string;
  journey: Journey;
  createdAt: string;
  verdicts: Record<PersonaId, PersonaVerdict>;
  /** Mean completion rate across personas. The headline number. */
  journeyCompletionRate: number;
  /**
   * True when baseline completed but at least one constrained persona did not.
   * This is the load-bearing claim: the site is the variable, not the model.
   */
  siteIsTheVariable: boolean;
  /**
   * True when a persona only got through by activating a control it could not
   * identify. The journey is technically completable and still not safely so.
   */
  completedOnlyByGuessing: boolean;
  durationMs: number;
  costUsd: number;
}

export interface Patch {
  /** Unified diff. */
  diff: string;
  filePath: string;
  rationale: string;
  wcag: string[];
  blockerKind: BlockerKind;
}

export interface FixVerification {
  patch: Patch;
  /** The persona verdict on the patched build, same journey, same persona. */
  before: PersonaVerdict;
  after: PersonaVerdict;
  /** after.rate - before.rate. Positive means the fix is real. */
  delta: number;
  proven: boolean;
}

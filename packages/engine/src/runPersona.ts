/**
 * One persona, one attempt at one journey.
 *
 * The loop is deliberately boring: snapshot, observe, decide, act, repeat. The
 * interesting part is the ending. A run only counts as completed when an assertion
 * evaluated against the live page agrees with the model, which is why a model that
 * hallucinates success produces `false_completion` rather than a green tick.
 */

import { withBrowserSession, type PageHandle } from "./browserSession.js";
import { isSilentControl, snapshotAxTree, type AxSnapshot } from "./axtree.js";
import { act, checkAssertion, currentUrl, observe, renderObservation } from "./page.js";
import { locateBlocker } from "./blocker.js";
import { getPersona } from "./personas.js";
import type { ReasoningProvider, ReasoningTurn } from "./reasoning.js";
import type {
  Action,
  AxNode,
  Journey,
  Observation,
  PersonaId,
  PersonaRunResult,
  StepRecord,
} from "./types.js";

export interface RunPersonaOptions {
  region: string;
  journey: Journey;
  persona: PersonaId;
  /** Label used for the AgentCore session, which shows up in CloudWatch. */
  runLabel: string;
  /** Whatever is deciding the actions. Recorded in the evidence bundle. */
  provider: ReasoningProvider;
  onEvent?: (event: RunEvent) => void;
}

export type RunEvent =
  | { type: "session_started"; persona: PersonaId; browserSessionId?: string }
  | { type: "step"; persona: PersonaId; record: StepRecord; narration: string }
  | { type: "finished"; persona: PersonaId; result: PersonaRunResult };

/** Conversation history is trimmed so long journeys do not blow up input tokens. */
const MAX_HISTORY_TURNS = 8;

function trimHistory(history: ReasoningTurn[]): ReasoningTurn[] {
  if (history.length <= MAX_HISTORY_TURNS * 2) return history;
  return history.slice(history.length - MAX_HISTORY_TURNS * 2);
}

/**
 * Which node an action is about to activate, if any.
 *
 * `click_node` names its target directly. A keyboard activation acts on whatever
 * currently holds focus, which is the honest reading of pressing Enter.
 */
function targetedNode(action: Action, snapshot: AxSnapshot): AxNode | undefined {
  if (action.action === "click_node" && action.ref !== undefined) {
    return snapshot.nodes.find((n) => n.ref === action.ref);
  }
  if (action.action === "press" && (action.key === "Enter" || action.key === "Space")) {
    return snapshot.nodes.find((n) => n.ref === snapshot.focusedRef);
  }
  return undefined;
}

async function selectorFor(page: PageHandle, node: AxNode): Promise<string | undefined> {
  if (node.backendNodeId === undefined) return undefined;
  try {
    const { object } = await page.cdp.send<{ object: { objectId?: string } }>(
      "DOM.resolveNode",
      { backendNodeId: node.backendNodeId },
      page.sessionId,
    );
    if (!object.objectId) return undefined;
    const { result } = await page.cdp.send<{ result: { value?: string } }>(
      "Runtime.callFunctionOn",
      {
        objectId: object.objectId,
        returnByValue: true,
        functionDeclaration:
          "function(){ return this.id ? '#' + this.id : this.tagName.toLowerCase(); }",
      },
      page.sessionId,
    );
    return result.value;
  } catch {
    return undefined;
  }
}

/**
 * One line of memory per turn: where the persona was and what it was focused on.
 * Enough to avoid repeating itself, far short of resending the tree.
 */
function digestObservation(observation: Observation, snapshot: AxSnapshot): string {
  const focused = snapshot.nodes.find((n) => n.ref === observation.focusedRef);
  const where = focused ? `focus on [${focused.ref}] ${focused.role} ${focused.name ? `"${focused.name}"` : "(no accessible name)"}` : "nothing focused";
  return `step ${observation.step} at ${observation.url}, ${where}`;
}

export async function runPersona(opts: RunPersonaOptions): Promise<PersonaRunResult> {
  const persona = getPersona(opts.persona);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const steps: StepRecord[] = [];
  const blindActivations: NonNullable<StepRecord["blindActivation"]>[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  const base: PersonaRunResult = {
    persona: persona.id,
    outcome: "error",
    completed: false,
    steps,
    startedAt,
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    blindActivations,
  };

  try {
    return await withBrowserSession(
      {
        region: opts.region,
        name: `buyable-${opts.runLabel}-${persona.id}`.slice(0, 48),
        timeoutSeconds: 900,
      },
      async (page, session) => {
        opts.onEvent?.({
          type: "session_started",
          persona: persona.id,
          browserSessionId: session.browserSessionId,
        });
        base.browserSessionId = session.browserSessionId;

        await page.cdp.send("Page.navigate", { url: opts.journey.startUrl }, page.sessionId);
        await new Promise((r) => setTimeout(r, 2000));

        const history: ReasoningTurn[] = [];
        let pendingAnnouncements: string[] = [];
        let lastActionError: string | undefined;

        for (let step = 1; step <= persona.maxSteps; step++) {
          const snapshot = await snapshotAxTree(page);
          const observation = await observe(
            page,
            persona,
            snapshot,
            step,
            pendingAnnouncements,
            lastActionError,
          );
          pendingAnnouncements = [];
          lastActionError = undefined;

          const observationText = renderObservation(observation, snapshot, persona);

          const decision = await opts.provider.decide({
            persona,
            goal: opts.journey.goal,
            history: trimHistory(history),
            observationText,
            screenshotBase64: observation.screenshotBase64,
          });
          inputTokens += decision.inputTokens;
          outputTokens += decision.outputTokens;

          // History carries a digest, not the full tree. The current turn already
          // contains the complete observation, and resending eight prior trees was
          // most of the token bill for no decision-making benefit.
          history.push({ role: "user", text: digestObservation(observation, snapshot) });
          history.push({
            role: "assistant",
            text: `${decision.action.action}: ${decision.action.reason}`,
          });

          const record: StepRecord = {
            step,
            observationDigest: observationText.slice(0, 400),
            action: decision.action,
            url: observation.url,
            focusedRef: observation.focusedRef,
            at: Date.now() - t0,
          };

          // Terminal intents are handled before actuation, since neither touches the page.
          if (decision.action.action === "finish") {
            const assertion = await checkAssertion(page, opts.journey.assertion);
            steps.push(record);
            opts.onEvent?.({ type: "step", persona: persona.id, record, narration: decision.narration });

            const result: PersonaRunResult = {
              ...base,
              outcome: assertion.passed ? "completed" : "false_completion",
              completed: assertion.passed,
              steps,
              inputTokens,
              outputTokens,
              blindActivations,
              durationMs: Date.now() - t0,
              finalUrl: observation.url,
              errorMessage: assertion.passed ? undefined : `Claimed success, but ${assertion.detail}`,
            };
            opts.onEvent?.({ type: "finished", persona: persona.id, result });
            return result;
          }

          if (decision.action.action === "blocked") {
            steps.push(record);
            opts.onEvent?.({ type: "step", persona: persona.id, record, narration: decision.narration });

            const explanation =
              decision.action.blockedExplanation || decision.action.reason || decision.narration;
            const blocker = await locateBlocker({
              page,
              snapshot,
              persona: persona.id,
              step,
              url: observation.url,
              agentExplanation: explanation,
            });

            const result: PersonaRunResult = {
              ...base,
              outcome: "blocked",
              completed: false,
              steps,
              blocker,
              inputTokens,
              outputTokens,
              blindActivations,
              durationMs: Date.now() - t0,
              finalUrl: observation.url,
            };
            opts.onEvent?.({ type: "finished", persona: persona.id, result });
            return result;
          }

          // Record activations of controls that announce nothing, before acting, while
          // the snapshot that the decision was made against is still the current one.
          const targeted = targetedNode(decision.action, snapshot);
          if (targeted && isSilentControl(targeted)) {
            const entry = {
              role: targeted.role,
              selector: await selectorFor(page, targeted),
              inferredPurpose: decision.action.reason,
            };
            record.blindActivation = entry;
            blindActivations.push(entry);
          }

          const actResult = await act(page, persona, snapshot, decision.action);
          if (actResult.error) {
            record.error = actResult.error;
            lastActionError = actResult.error;
          }
          pendingAnnouncements = actResult.announcements;

          steps.push(record);
          opts.onEvent?.({ type: "step", persona: persona.id, record, narration: decision.narration });

          // A persona can wander into success without declaring it, which still counts.
          if (actResult.navigated) {
            const assertion = await checkAssertion(page, opts.journey.assertion);
            if (assertion.passed) {
              const result: PersonaRunResult = {
                ...base,
                outcome: "completed",
                completed: true,
                steps,
                inputTokens,
                outputTokens,
                durationMs: Date.now() - t0,
                finalUrl: await (async () => observation.url)(),
              };
              opts.onEvent?.({ type: "finished", persona: persona.id, result });
              return result;
            }
          }
        }

        // Out of steps. Record where it got stuck so the report is still actionable.
        const snapshot = await snapshotAxTree(page);
        const blocker = await locateBlocker({
          page,
          snapshot,
          persona: persona.id,
          step: persona.maxSteps,
          url: opts.journey.startUrl,
          agentExplanation: `Ran out of steps after ${persona.maxSteps} turns without reaching the goal. Last URL was ${await currentUrl(page)}.`,
        });

        const result: PersonaRunResult = {
          ...base,
          outcome: "exhausted",
          completed: false,
          steps,
          blocker,
          inputTokens,
          outputTokens,
          blindActivations,
          durationMs: Date.now() - t0,
        };
        opts.onEvent?.({ type: "finished", persona: persona.id, result });
        return result;
      },
    );
  } catch (err) {
    // Infrastructure failures are never counted against the site under test.
    const result: PersonaRunResult = {
      ...base,
      outcome: "error",
      completed: false,
      steps,
      inputTokens,
      outputTokens,
      blindActivations,
      durationMs: Date.now() - t0,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    opts.onEvent?.({ type: "finished", persona: persona.id, result });
    return result;
  }
}

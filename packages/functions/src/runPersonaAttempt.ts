/**
 * Step Functions task: one persona, one attempt.
 *
 * The unit of work is deliberately a single attempt rather than a whole persona.
 * Three attempts of a long checkout can run to eight minutes, which is uncomfortably
 * close to the Lambda ceiling, and splitting them means Step Functions owns the retry
 * and the timeout instead of a try/catch inside a function that might be about to be
 * killed.
 */

import { runPersona, type PersonaId, type Journey } from "@buyable/engine";
import { getProvider, putEvent, REGION } from "./shared.js";

export interface AttemptInput {
  runId: string;
  journey: Journey;
  persona: PersonaId;
  attempt: number;
}

export async function handler(input: AttemptInput) {
  const provider = await getProvider();

  // Events are numbered by persona and attempt so the status page can order them
  // without needing a coordinating counter across parallel branches.
  const base = (input.persona.charCodeAt(0) % 10) * 10000 + input.attempt * 1000;
  let seq = base;

  const result = await runPersona({
    region: REGION,
    journey: input.journey,
    persona: input.persona,
    runLabel: `${input.runId.slice(0, 8)}-a${input.attempt}`,
    provider,
    onEvent: (event) => {
      // Fire and forget. A dropped progress event is a cosmetic problem; blocking the
      // run on a DynamoDB write is a real one.
      void putEvent(input.runId, seq++, event).catch(() => {});
    },
  });

  return result;
}

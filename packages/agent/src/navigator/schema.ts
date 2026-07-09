import { z } from 'zod';

import { LlmActionSchema } from './llm-action-schema';

/**
 * The LLM's structured output for one navigation step — `docs/DESIGN.md` §5's
 * `AgentBrain` shape (the Navigator returns `actions`, where the Planner returns `plan`).
 * `actions` uses {@link LlmActionSchema} (transform-free — see that module for why),
 * not `@aegis/actions`' `ActionSchema` directly; hallucinated-but-well-formed refs are
 * checked separately (`hallucinated-refs.ts`), since that depends on runtime perception,
 * not static shape.
 */
export const NavigatorOutputSchema = z.object({
  observation: z.string(),
  reasoning: z.string(),
  memory: z.string(),
  nextGoal: z.string(),
  actions: z.array(LlmActionSchema).max(4),
});

export type NavigatorLlmOutput = z.infer<typeof NavigatorOutputSchema>;

import { z } from 'zod';

/**
 * The LLM's structured output for one planning step — richer than {@link PlanOutput}
 * (`loop/services.ts`), which is the minimal contract the state machine consumes. This
 * is `docs/DESIGN.md` §5's `AgentBrain` shape, with `actions` replaced by `plan` (a
 * Planner returns a plan, not concrete actions — that's the Navigator's job, #17).
 */
export const PlannerOutputSchema = z.object({
  observation: z.string(),
  reasoning: z.string(),
  memory: z.string(),
  nextGoal: z.string(),
  plan: z.array(z.string()).max(10),
  taskComplete: z.boolean(),
  summary: z.string().optional(),
});

export type PlannerLlmOutput = z.infer<typeof PlannerOutputSchema>;

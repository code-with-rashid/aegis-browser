import { z } from 'zod';

/**
 * The LLM's structured output for one verification step. Only called when every action
 * in the run succeeded mechanically (see `create-verifier-service.ts`'s heuristic
 * pre-check) — this schema is purely about whether the sub-goal's *intent* was actually
 * satisfied, catching "declared success but nothing happened" (`docs/DESIGN.md` §5).
 */
export const VerifierOutputSchema = z.object({
  reasoning: z.string(),
  subGoalAchieved: z.boolean(),
  /** Only meaningful when `subGoalAchieved` is true — is the ENTIRE task now complete? */
  taskComplete: z.boolean(),
});

export type VerifierLlmOutput = z.infer<typeof VerifierOutputSchema>;

import { z } from 'zod';

/**
 * The LLM's structured output for one alignment check (`docs/DESIGN.md` §7.2): does the
 * proposed action serve the user's original intent, or does it look induced by the page?
 */
export const CriticOutputSchema = z.object({
  reasoning: z.string(),
  aligned: z.boolean(),
});

export type CriticLlmOutput = z.infer<typeof CriticOutputSchema>;

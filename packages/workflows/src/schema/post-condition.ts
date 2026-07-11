import { z } from 'zod';

/**
 * What must be true after a step executes for it to count as successful — checked by the
 * deterministic executor (#111) and evaluated in full by #112's step-verification pass.
 * A discriminated union, same convention as `@aegis/actions`' `Action` schema, so adding a
 * new condition kind later is additive, not a breaking change to existing workflows.
 */
export const PostConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('element_visible'), selector: z.string().min(1) }),
  z.object({ type: z.literal('element_hidden'), selector: z.string().min(1) }),
  z.object({ type: z.literal('url_matches'), pattern: z.string().min(1) }),
  z.object({ type: z.literal('text_contains'), text: z.string().min(1) }),
]);

export type PostCondition = z.infer<typeof PostConditionSchema>;
export type PostConditionType = PostCondition['type'];

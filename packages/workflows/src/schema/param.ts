import { z } from 'zod';

/**
 * A typed, run-time input a workflow exposes (#110) — extracted at record time from a
 * literal value the recorded run used (a search term, a form field). A `value` param
 * takes a plain default the caller can override per run; a `secret` param never carries a
 * value at all, only a `secretName` reference — resolved from the vault at run start,
 * never in a prompt, the same `‹secret:name›`-by-reference discipline
 * `McpAuthHeaderConfig` and `input_text`/`send_keys` secret placeholders already follow.
 */
export const WorkflowParamSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('value'),
    name: z.string().min(1),
    description: z.string().optional(),
    defaultValue: z.string().optional(),
  }),
  z.object({
    kind: z.literal('secret'),
    name: z.string().min(1),
    description: z.string().optional(),
    secretName: z.string().min(1),
  }),
]);

export type WorkflowParam = z.infer<typeof WorkflowParamSchema>;
export type WorkflowParamKind = WorkflowParam['kind'];

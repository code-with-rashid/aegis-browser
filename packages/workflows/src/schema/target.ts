import { z } from 'zod';

/**
 * Where a recorded step's action targeted, captured at record time. `ref` is the
 * perception ref the agent loop resolved *that run* — useful for provenance/debugging,
 * but not guaranteed to resolve on a later replay, since a fresh page load can assign
 * different refs. `selector` is the resilient, replayable target (e.g. a CSS selector);
 * `role`/`name` are the accessible role/name, for a self-heal pass to re-locate the
 * element semantically when `selector` no longer matches anything (#113).
 */
export const WorkflowTargetSchema = z.object({
  ref: z.string().min(1).optional(),
  selector: z.string().min(1),
  role: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

export type WorkflowTarget = z.infer<typeof WorkflowTargetSchema>;

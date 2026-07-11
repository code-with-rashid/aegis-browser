import { z } from 'zod';

import { toRunRecordId, toWorkflowId } from '../ids';

/** Validates a raw string and brands it as a {@link RunRecordId}. */
export const RunRecordIdSchema = z.string().min(1).transform(toRunRecordId);

/**
 * How a background run currently stands. `running` is the only non-terminal status — a
 * record left in `running` when the service worker was evicted is exactly what
 * `initialize()` (composition-root, `apps/extension`) resumes on the next startup.
 * `needs_confirmation` is included for completeness even though `gateHeal` (#114) never
 * actually produces it for `mode: 'unattended'` (which this engine always uses) — a
 * `WorkflowRunRecord` still needs a status to land on if that ever changed.
 */
export const RunRecordStatusSchema = z.enum([
  'running',
  'completed',
  'failed',
  'needs_confirmation',
  'hard_stopped',
  'aborted',
]);
export type RunRecordStatus = z.infer<typeof RunRecordStatusSchema>;

/**
 * Persisted progress of one background workflow run (#115). `stepResults` and
 * `nextStepIndex` are the checkpoint a restarted service worker resumes from — everything
 * before `nextStepIndex` already ran and is never re-executed. `stepResults` is `unknown[]`
 * (actually `WorkflowStepResult[]`) rather than schema-validated: our own serialized data,
 * round-tripped through the same process — trusted, not re-validated at this internal
 * boundary, the same convention `apps/extension`'s own trace persistence already uses.
 */
export const WorkflowRunRecordSchema = z.object({
  id: RunRecordIdSchema,
  workflowId: z.string().min(1).transform(toWorkflowId),
  status: RunRecordStatusSchema,
  values: z.record(z.string(), z.string()),
  nextStepIndex: z.number().int().nonnegative(),
  stepResults: z.array(z.unknown()),
  reason: z.string().optional(),
  /** The managed tab (`apps/extension`, #115) driving this run — reattached to, not re-opened, on resume when it still exists. */
  tabId: z.number().int().optional(),
  startedAt: z.number(),
  updatedAt: z.number(),
});

export type WorkflowRunRecord = z.infer<typeof WorkflowRunRecordSchema>;

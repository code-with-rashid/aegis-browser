import { z } from 'zod';

/**
 * The on-disk shape of one persisted workflow: `schemaVersion` records which
 * `WorkflowSchema` shape `workflow` was written under, so a read can migrate it forward
 * (`../migration`) before ever validating against the *current* `WorkflowSchema`.
 * `workflow` is deliberately `unknown` here — it may not satisfy the current schema yet.
 */
export const WorkflowEnvelopeSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  workflow: z.unknown(),
});

export type WorkflowEnvelope = z.infer<typeof WorkflowEnvelopeSchema>;

/** Every persisted workflow, keyed by id — one storage key, matching `@aegis/mcp`'s `McpServerStore` (few enough entries not to need per-id keys; revisit if that stops holding). */
export const WorkflowEnvelopeMapSchema = z.record(z.string(), WorkflowEnvelopeSchema);

export type WorkflowEnvelopeMap = z.infer<typeof WorkflowEnvelopeMapSchema>;

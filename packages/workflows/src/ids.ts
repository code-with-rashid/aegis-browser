import type { Brand } from '@aegis/shared';

/**
 * Identifies one workflow across its whole lifetime (record → edit → heal → re-run) —
 * stable across every `version` bump. Local to this package (unlike `TaskId`/`ElementRef`
 * in `@aegis/shared`) since nothing below `@aegis/workflows` in the dependency direction
 * (`agent`/`actions`/`perception`/`security`/`shared`) ever needs to reference one.
 */
export type WorkflowId = Brand<string, 'WorkflowId'>;

/** Brands a raw string as a {@link WorkflowId}. Callers are responsible for uniqueness. */
export function toWorkflowId(value: string): WorkflowId {
  return value as WorkflowId;
}

/**
 * Identifies one step within a workflow, stable across edits/reordering/healing — so a
 * heal, a reorder, or a rollback can name "this exact step" without relying on its
 * position in the `steps` array, which can change.
 */
export type WorkflowStepId = Brand<string, 'WorkflowStepId'>;

/** Brands a raw string as a {@link WorkflowStepId}. Callers are responsible for uniqueness. */
export function toWorkflowStepId(value: string): WorkflowStepId {
  return value as WorkflowStepId;
}

/**
 * Identifies one background run of a workflow (#115) — stable across a service-worker
 * eviction/restart, so a resumed run updates the same persisted record rather than
 * starting a fresh one.
 */
export type RunRecordId = Brand<string, 'RunRecordId'>;

/** Brands a raw string as a {@link RunRecordId}. Callers are responsible for uniqueness. */
export function toRunRecordId(value: string): RunRecordId {
  return value as RunRecordId;
}

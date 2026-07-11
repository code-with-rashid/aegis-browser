import { AegisError } from '@aegis/shared';

/**
 * Discriminates why a workflow operation failed. `NOT_FOUND`/`ALREADY_EXISTS` are
 * domain-level business-rule violations on a {@link WorkflowStore} operation (distinct
 * from `StorageError`'s own read/write/validation failure codes) — a caller needs to tell
 * "no such workflow" apart from "storage itself broke." `PARAM_*` codes are raised by
 * `validateWorkflowParams`/`resolveWorkflowParams` (#110): a placeholder referencing a
 * param that was never declared, two params sharing a name, or a `value`-kind param with
 * neither a supplied run-time value nor a `defaultValue`.
 */
export type WorkflowErrorCode =
  | 'WORKFLOW_NOT_FOUND'
  | 'WORKFLOW_ALREADY_EXISTS'
  | 'STORAGE_FAILED'
  | 'PARAM_NOT_DECLARED'
  | 'PARAM_DUPLICATE'
  | 'PARAM_VALUE_MISSING';

/** Typed error raised by a {@link WorkflowStore} operation, or by param validation/resolution. */
export class WorkflowError extends AegisError {
  readonly code: WorkflowErrorCode;

  constructor(code: WorkflowErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

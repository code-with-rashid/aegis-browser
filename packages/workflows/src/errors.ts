import { AegisError } from '@aegis/shared';

/**
 * Discriminates why a {@link WorkflowStore} operation failed. `NOT_FOUND`/`ALREADY_EXISTS`
 * are domain-level business-rule violations (distinct from `StorageError`'s own
 * read/write/validation failure codes) — a caller needs to tell "no such workflow" apart
 * from "storage itself broke."
 */
export type WorkflowErrorCode = 'WORKFLOW_NOT_FOUND' | 'WORKFLOW_ALREADY_EXISTS' | 'STORAGE_FAILED';

/** Typed error raised by a {@link WorkflowStore} operation. */
export class WorkflowError extends AegisError {
  readonly code: WorkflowErrorCode;

  constructor(code: WorkflowErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

import { AegisError } from '@aegis/shared';

/**
 * Discriminates why a deterministic workflow replay stopped a step. `TARGET_NOT_FOUND`
 * means neither the recorded `ref` nor the resilient `selector` (#109) resolves against
 * the current page — a real, expected replay failure mode (the page changed since
 * recording), not something this issue's executor tries to recover from; that's #113's
 * job. `TOOL_CALL_FAILED` means the tool itself ran and reported failure.
 */
export type WorkflowExecutionErrorCode = 'TARGET_NOT_FOUND' | 'TOOL_CALL_FAILED';

/** Typed error raised when a deterministic workflow replay can't complete a step. */
export class WorkflowExecutionError extends AegisError {
  readonly code: WorkflowExecutionErrorCode;

  constructor(code: WorkflowExecutionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

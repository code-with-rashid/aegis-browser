import { AegisError, err, ok, type Result } from '@aegis/shared';

import { ActionSchema, type Action } from './schema';

export type ActionValidationErrorCode = 'ACTION_INVALID_PARAMS';

/** Typed error raised when validating a raw action against {@link ActionSchema} fails. */
export class ActionValidationError extends AegisError {
  readonly code: ActionValidationErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = 'ACTION_INVALID_PARAMS';
  }
}

/** Validates a raw action against the built-in action schemas, with full compile-time typing. */
export function validateAction(raw: unknown): Result<Action, ActionValidationError> {
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ActionValidationError(`Invalid action: ${parsed.error.message}`, { cause: parsed.error }),
    );
  }
  return ok(parsed.data);
}

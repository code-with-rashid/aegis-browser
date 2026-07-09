import { AegisError } from '@aegis/shared';

export type AgentErrorCode =
  'PLANNER_FAILED' | 'NAVIGATOR_FAILED' | 'VERIFIER_FAILED' | 'POLICY_CHECK_FAILED';

/** Typed error raised by a loop service (planner/navigator/verifier/policy). */
export class AgentError extends AegisError {
  readonly code: AgentErrorCode;

  constructor(code: AgentErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

import { AegisError, type Result } from '@aegis/shared';

/** Discriminates why an {@link LlmProvider} call failed. */
export type LlmErrorCode =
  'LLM_TIMEOUT' | 'LLM_ABORTED' | 'LLM_REQUEST_FAILED' | 'LLM_INVALID_CONFIG';

/** Typed error raised by provider creation or a model call. */
export class LlmError extends AegisError {
  readonly code: LlmErrorCode;

  constructor(code: LlmErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/** A single text-generation request, provider-agnostic. */
export interface LlmTextRequest {
  readonly prompt: string;
  readonly system?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  /** Aborts the request after this many milliseconds. */
  readonly timeoutMs?: number;
  /** An external abort signal (e.g. the user pressed "stop"), combined with `timeoutMs`. */
  readonly signal?: AbortSignal;
}

/** The provider-agnostic result of a text-generation request. */
export interface LlmTextResult {
  readonly text: string;
  readonly finishReason: string;
}

/**
 * Provider-agnostic access to one configured model. Adapters (`adapters/*.ts`) close
 * over a concrete AI SDK model and implement this interface; {@link MockProviderOptions}
 * implements it without any network access for tests.
 */
export interface LlmProvider {
  /** A stable identifier, e.g. `openai:gpt-4o`. */
  readonly id: string;
  generateText(request: LlmTextRequest): Promise<Result<LlmTextResult, LlmError>>;
}

import { ok, type Result } from '@aegis/shared';

import type { LlmError, LlmProvider, LlmTextRequest, LlmTextResult } from './provider';

export interface MockProviderOptions {
  readonly id?: string;
  /** Canned responses returned in order; the last one repeats once exhausted. */
  readonly responses?: readonly string[];
  /** Full control over `generateText`, overriding `responses`. */
  readonly generateText?: (request: LlmTextRequest) => Promise<Result<LlmTextResult, LlmError>>;
}

/** A deterministic {@link LlmProvider} for tests. Never makes a network call. */
export function createMockProvider(options: MockProviderOptions = {}): LlmProvider {
  const responses = options.responses ?? ['mock response'];
  let callCount = 0;

  const defaultGenerateText = (): Promise<Result<LlmTextResult, LlmError>> => {
    const text = responses[Math.min(callCount, responses.length - 1)] ?? '';
    callCount += 1;
    return Promise.resolve(ok({ text, finishReason: 'stop' }));
  };

  return {
    id: options.id ?? 'mock:test-model',
    generateText: options.generateText ?? defaultGenerateText,
  };
}

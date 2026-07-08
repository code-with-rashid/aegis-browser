import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { isErr, isOk } from '@aegis/shared';

import { combineSignals, mapError, runGenerateText } from './generate-text';

describe('combineSignals', () => {
  it('returns undefined when neither signal is provided', () => {
    expect(combineSignals(undefined, undefined)).toBeUndefined();
  });

  it('returns the single signal when only one is provided', () => {
    const controller = new AbortController();
    expect(combineSignals(controller.signal, undefined)).toBe(controller.signal);
    expect(combineSignals(undefined, controller.signal)).toBe(controller.signal);
  });

  it('aborts when either combined signal aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineSignals(a.signal, b.signal);

    expect(combined?.aborted).toBe(false);
    a.abort();
    expect(combined?.aborted).toBe(true);
  });
});

describe('mapError', () => {
  it('maps a TimeoutError DOMException to LLM_TIMEOUT', () => {
    const error = mapError(new DOMException('timed out', 'TimeoutError'));
    expect(error.code).toBe('LLM_TIMEOUT');
  });

  it('maps an AbortError DOMException to LLM_ABORTED', () => {
    const error = mapError(new DOMException('aborted', 'AbortError'));
    expect(error.code).toBe('LLM_ABORTED');
  });

  it('maps any other error to LLM_REQUEST_FAILED', () => {
    const error = mapError(new Error('network down'));
    expect(error.code).toBe('LLM_REQUEST_FAILED');
    expect(error.message).toContain('network down');
  });

  it('maps a non-Error thrown value to LLM_REQUEST_FAILED with a generic message', () => {
    const error = mapError('a plain string was thrown');
    expect(error.code).toBe('LLM_REQUEST_FAILED');
  });
});

const FIXTURE_USAGE = {
  inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

describe('runGenerateText', () => {
  it('returns the generated text and finish reason on success', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: () =>
        Promise.resolve({
          content: [{ type: 'text', text: 'hello from the model' }],
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage: FIXTURE_USAGE,
          warnings: [],
        }),
    });

    const result = await runGenerateText(model, { prompt: 'hi' });

    expect(isOk(result) && result.value.text).toBe('hello from the model');
    expect(isOk(result) && result.value.finishReason).toBe('stop');
  });

  it('wraps a rejected generation in a typed LlmError', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: () => Promise.reject(new Error('provider unreachable')),
    });

    const result = await runGenerateText(model, { prompt: 'hi' });

    expect(isErr(result) && result.error.code).toBe('LLM_REQUEST_FAILED');
  });

  it('aborts the request once the timeout elapses', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (options.abortSignal?.aborted) {
          throw options.abortSignal.reason;
        }
        return {
          content: [{ type: 'text', text: 'too slow' }],
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage: FIXTURE_USAGE,
          warnings: [],
        };
      },
    });

    const result = await runGenerateText(model, { prompt: 'hi', timeoutMs: 5 });

    expect(isErr(result) && result.error.code).toBe('LLM_TIMEOUT');
  });
});

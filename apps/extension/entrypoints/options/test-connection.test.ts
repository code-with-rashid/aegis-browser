import { createMockProvider, LlmError, type ProviderFactory } from '@aegis/llm';
import { err, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { testProviderConnection } from './test-connection';

const config = { kind: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' } as const;

describe('testProviderConnection', () => {
  it('reports success when the provider replies', async () => {
    const createProvider: ProviderFactory = () => ok(createMockProvider({ responses: ['OK'] }));

    const result = await testProviderConnection(config, createProvider);

    expect(result).toEqual({ ok: true, value: { text: 'OK', finishReason: 'stop' } });
  });

  it('surfaces a provider-creation failure without calling generateText', async () => {
    const createProvider: ProviderFactory = () =>
      err(new LlmError('LLM_INVALID_CONFIG', 'bad config'));

    const result = await testProviderConnection(config, createProvider);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_INVALID_CONFIG');
    }
  });

  it('surfaces a generateText failure', async () => {
    const createProvider: ProviderFactory = () =>
      ok(
        createMockProvider({
          generateText: () =>
            Promise.resolve(err(new LlmError('LLM_REQUEST_FAILED', 'network error'))),
        }),
      );

    const result = await testProviderConnection(config, createProvider);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('network error');
    }
  });
});

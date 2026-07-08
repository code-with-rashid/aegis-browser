import { describe, expect, it } from 'vitest';

import { isErr, isOk } from '@aegis/shared';

import { ProviderRegistry } from './registry';

describe('ProviderRegistry', () => {
  const registry = new ProviderRegistry();

  it('creates a working openai provider', () => {
    const result = registry.create({ kind: 'openai', apiKey: 'sk-1', model: 'gpt-4o' });
    expect(isOk(result) && result.value.id).toBe('openai:gpt-4o');
  });

  it('creates a working anthropic provider', () => {
    const result = registry.create({
      kind: 'anthropic',
      apiKey: 'sk-ant-1',
      model: 'claude-sonnet-5',
    });
    expect(isOk(result) && result.value.id).toBe('anthropic:claude-sonnet-5');
  });

  it('creates a working google provider', () => {
    const result = registry.create({ kind: 'google', apiKey: 'g-1', model: 'gemini-2.5-pro' });
    expect(isOk(result) && result.value.id).toBe('google:gemini-2.5-pro');
  });

  it('creates a working ollama provider defaulting to localhost', () => {
    const result = registry.create({ kind: 'ollama', model: 'llama3.1' });
    expect(isOk(result) && result.value.id).toBe('ollama:llama3.1');
  });

  it('creates a working openai-compatible provider', () => {
    const result = registry.create({
      kind: 'openai-compatible',
      model: 'local-model',
      baseUrl: 'http://localhost:8080/v1',
    });
    expect(isOk(result) && result.value.id).toBe('openai-compatible:local-model');
  });

  it('rejects an invalid config with LLM_INVALID_CONFIG', () => {
    const result = registry.create({ kind: 'openai', model: 'gpt-4o' } as never);
    expect(isErr(result) && result.error.code).toBe('LLM_INVALID_CONFIG');
  });

  it('never logs or throws the api key when creating a provider fails', () => {
    let thrown: unknown;
    try {
      registry.create({ kind: 'openai', apiKey: '', model: '' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeUndefined();

    const result = registry.create({ kind: 'openai', apiKey: 'super-secret-key', model: '' });
    const serialized = isErr(result)
      ? String(result.error) + JSON.stringify(result.error.cause)
      : '';
    expect(serialized).not.toContain('super-secret-key');
  });
});

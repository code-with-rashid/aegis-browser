import { describe, expect, it } from 'vitest';

import { ProviderConfigSchema } from './config';

describe('ProviderConfigSchema', () => {
  it('accepts a valid openai config', () => {
    const result = ProviderConfigSchema.safeParse({
      kind: 'openai',
      apiKey: 'sk-1',
      model: 'gpt-4o',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid anthropic config', () => {
    const result = ProviderConfigSchema.safeParse({
      kind: 'anthropic',
      apiKey: 'sk-ant-1',
      model: 'claude-sonnet-5',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid google config', () => {
    const result = ProviderConfigSchema.safeParse({
      kind: 'google',
      apiKey: 'g-1',
      model: 'gemini-2.5-pro',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an ollama config without a baseUrl (defaulted by the adapter)', () => {
    const result = ProviderConfigSchema.safeParse({ kind: 'ollama', model: 'llama3.1' });
    expect(result.success).toBe(true);
  });

  it('accepts an openai-compatible config with an optional apiKey', () => {
    const result = ProviderConfigSchema.safeParse({
      kind: 'openai-compatible',
      model: 'local-model',
      baseUrl: 'http://localhost:8080/v1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a config missing a required apiKey', () => {
    const result = ProviderConfigSchema.safeParse({ kind: 'openai', model: 'gpt-4o' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    const result = ProviderConfigSchema.safeParse({ kind: 'not-a-provider', model: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-URL baseUrl', () => {
    const result = ProviderConfigSchema.safeParse({
      kind: 'openai-compatible',
      model: 'local-model',
      baseUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

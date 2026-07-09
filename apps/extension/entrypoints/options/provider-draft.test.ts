import type { ProviderConfig } from '@aegis/llm';
import { describe, expect, it } from 'vitest';

import { draftFromConfig, EMPTY_PROVIDER_DRAFT, toProviderConfig } from './provider-draft';
import type { ProviderDraft } from './provider-draft';

describe('toProviderConfig', () => {
  it('builds an openai config when apiKey and model are filled in', () => {
    const draft: ProviderDraft = {
      kind: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      baseUrl: '',
    };
    expect(toProviderConfig(draft)).toEqual({
      kind: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
    });
  });

  it('builds an anthropic config', () => {
    const draft: ProviderDraft = {
      kind: 'anthropic',
      apiKey: 'sk-ant',
      model: 'claude-sonnet',
      baseUrl: '',
    };
    expect(toProviderConfig(draft)).toEqual({
      kind: 'anthropic',
      apiKey: 'sk-ant',
      model: 'claude-sonnet',
    });
  });

  it('builds a google config', () => {
    const draft: ProviderDraft = {
      kind: 'google',
      apiKey: 'g-key',
      model: 'gemini-pro',
      baseUrl: '',
    };
    expect(toProviderConfig(draft)).toEqual({
      kind: 'google',
      apiKey: 'g-key',
      model: 'gemini-pro',
    });
  });

  it('builds an ollama config without a baseUrl when left blank', () => {
    const draft: ProviderDraft = { kind: 'ollama', apiKey: '', model: 'llama3', baseUrl: '' };
    expect(toProviderConfig(draft)).toEqual({ kind: 'ollama', model: 'llama3' });
  });

  it('builds an ollama config with a baseUrl when provided', () => {
    const draft: ProviderDraft = {
      kind: 'ollama',
      apiKey: '',
      model: 'llama3',
      baseUrl: 'http://localhost:11434',
    };
    expect(toProviderConfig(draft)).toEqual({
      kind: 'ollama',
      model: 'llama3',
      baseUrl: 'http://localhost:11434',
    });
  });

  it('builds an openai-compatible config, apiKey optional', () => {
    const draft: ProviderDraft = {
      kind: 'openai-compatible',
      apiKey: '',
      model: 'local-model',
      baseUrl: 'https://api.example.com/v1',
    };
    expect(toProviderConfig(draft)).toEqual({
      kind: 'openai-compatible',
      model: 'local-model',
      baseUrl: 'https://api.example.com/v1',
    });
  });

  it('returns undefined when a required field is missing', () => {
    const draft: ProviderDraft = { kind: 'openai', apiKey: '', model: 'gpt-4o-mini', baseUrl: '' };
    expect(toProviderConfig(draft)).toBeUndefined();
  });

  it('returns undefined when openai-compatible is missing its required baseUrl', () => {
    const draft: ProviderDraft = {
      kind: 'openai-compatible',
      apiKey: '',
      model: 'local-model',
      baseUrl: '',
    };
    expect(toProviderConfig(draft)).toBeUndefined();
  });

  it('returns undefined for an invalid URL', () => {
    const draft: ProviderDraft = {
      kind: 'openai-compatible',
      apiKey: '',
      model: 'local-model',
      baseUrl: 'not-a-url',
    };
    expect(toProviderConfig(draft)).toBeUndefined();
  });
});

describe('draftFromConfig', () => {
  it('returns the empty draft when config is undefined', () => {
    expect(draftFromConfig(undefined)).toEqual(EMPTY_PROVIDER_DRAFT);
  });

  it('round-trips every provider kind through toProviderConfig(draftFromConfig(config))', () => {
    const configs: ProviderConfig[] = [
      { kind: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
      { kind: 'anthropic', apiKey: 'sk-ant', model: 'claude-sonnet' },
      { kind: 'google', apiKey: 'g-key', model: 'gemini-pro' },
      { kind: 'ollama', model: 'llama3', baseUrl: 'http://localhost:11434' },
      { kind: 'ollama', model: 'llama3' },
      { kind: 'openai-compatible', model: 'local-model', baseUrl: 'https://api.example.com/v1' },
      {
        kind: 'openai-compatible',
        model: 'local-model',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
      },
    ];

    for (const config of configs) {
      expect(toProviderConfig(draftFromConfig(config))).toEqual(config);
    }
  });
});

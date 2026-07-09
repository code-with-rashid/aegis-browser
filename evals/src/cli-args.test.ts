import { describe, expect, it } from 'vitest';

import { parseCliArgs, resolveLiveProviderConfig } from './cli-args';

describe('parseCliArgs', () => {
  it('defaults to mock mode with no args', () => {
    expect(parseCliArgs([])).toEqual({ mode: 'mock' });
  });

  it('parses --mode=live', () => {
    expect(parseCliArgs(['--mode=live'])).toEqual({ mode: 'live' });
  });

  it('parses provider flags', () => {
    expect(
      parseCliArgs([
        '--mode=live',
        '--provider-kind=openai',
        '--api-key=sk-test',
        '--model=gpt-4o-mini',
      ]),
    ).toEqual({
      mode: 'live',
      providerKind: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
    });
  });

  it('ignores malformed or unrecognized args', () => {
    expect(parseCliArgs(['not-a-flag', '--no-equals', '--mode=live'])).toEqual({ mode: 'live' });
  });
});

describe('resolveLiveProviderConfig', () => {
  it('throws when provider-kind is missing', () => {
    expect(() => resolveLiveProviderConfig({ mode: 'live', model: 'gpt-4o-mini' })).toThrow(
      /requires --provider-kind/,
    );
  });

  it('builds an openai config', () => {
    expect(
      resolveLiveProviderConfig({
        mode: 'live',
        providerKind: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
      }),
    ).toEqual({ kind: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' });
  });

  it('throws for openai without an api key', () => {
    expect(() =>
      resolveLiveProviderConfig({ mode: 'live', providerKind: 'openai', model: 'gpt-4o-mini' }),
    ).toThrow(/requires --api-key/);
  });

  it('builds an ollama config without a baseUrl when omitted', () => {
    expect(
      resolveLiveProviderConfig({ mode: 'live', providerKind: 'ollama', model: 'llama3' }),
    ).toEqual({ kind: 'ollama', model: 'llama3' });
  });

  it('builds an openai-compatible config', () => {
    expect(
      resolveLiveProviderConfig({
        mode: 'live',
        providerKind: 'openai-compatible',
        model: 'local-model',
        baseUrl: 'http://localhost:11434/v1',
      }),
    ).toEqual({
      kind: 'openai-compatible',
      model: 'local-model',
      baseUrl: 'http://localhost:11434/v1',
    });
  });

  it('throws for openai-compatible without a base URL', () => {
    expect(() =>
      resolveLiveProviderConfig({
        mode: 'live',
        providerKind: 'openai-compatible',
        model: 'local-model',
      }),
    ).toThrow(/requires --base-url/);
  });

  it('throws for an unknown provider kind', () => {
    expect(() =>
      resolveLiveProviderConfig({ mode: 'live', providerKind: 'bogus', model: 'x' }),
    ).toThrow(/Unknown --provider-kind/);
  });
});

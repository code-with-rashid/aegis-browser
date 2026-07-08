import { createMemoryStorage, isErr, isOk, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createMockProvider } from './mock-provider';
import type { ModelRoutingConfig } from './model-routing';
import {
  AgentRoleSchema,
  createModelRouter,
  DEFAULT_ROLE_TEMPERATURE,
  loadModelRoutingConfig,
  ModelRoutingConfigSchema,
  saveModelRoutingConfig,
} from './model-routing';
import type { LlmTextRequest } from './provider';
import { ProviderRegistry } from './registry';

function roleConfig(
  model: string,
  overrides: { temperature?: number; maxOutputTokens?: number } = {},
) {
  return {
    provider: { kind: 'openai' as const, apiKey: 'sk-1', model },
    ...overrides,
  };
}

function fullRoutingConfig(): ModelRoutingConfig {
  return {
    planner: roleConfig('planner-model'),
    navigator: roleConfig('navigator-model'),
    verifier: roleConfig('verifier-model'),
    critic: roleConfig('critic-model'),
  };
}

describe('ModelRoutingConfigSchema', () => {
  it('accepts a fully-specified routing config', () => {
    const result = ModelRoutingConfigSchema.safeParse(fullRoutingConfig());
    expect(result.success).toBe(true);
  });

  it('rejects a config missing a role', () => {
    const config = fullRoutingConfig();
    const { critic: _critic, ...incomplete } = config;
    const result = ModelRoutingConfigSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects a role with an invalid provider config', () => {
    const config = fullRoutingConfig();
    const invalid = { ...config, planner: { provider: { kind: 'openai', model: 'x' } } };
    const result = ModelRoutingConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('createModelRouter', () => {
  it('resolves the right client per role', () => {
    const registry = new ProviderRegistry();
    const router = createModelRouter(registry.create.bind(registry), fullRoutingConfig());

    const planner = router.resolve('planner');
    const navigator = router.resolve('navigator');

    expect(isOk(planner) && planner.value.id).toBe('openai:planner-model');
    expect(isOk(navigator) && navigator.value.id).toBe('openai:navigator-model');
  });

  it('surfaces a provider creation failure through resolve()', () => {
    const registry = new ProviderRegistry();
    const config = fullRoutingConfig();
    config.critic.provider = { kind: 'openai', apiKey: '', model: '' };

    const router = createModelRouter(registry.create.bind(registry), config);
    const result = router.resolve('critic');

    expect(isErr(result) && result.error.code).toBe('LLM_INVALID_CONFIG');
  });

  it('applies the role default temperature when the caller does not specify one', async () => {
    let seenRequest: LlmTextRequest | undefined;
    const createProvider = () =>
      ok(
        createMockProvider({
          generateText: (request) => {
            seenRequest = request;
            return Promise.resolve(ok({ text: 'ok', finishReason: 'stop' }));
          },
        }),
      );

    const router = createModelRouter(createProvider, fullRoutingConfig());
    const provider = router.resolve('planner');
    await (isOk(provider) && provider.value.generateText({ prompt: 'hi' }));

    expect(seenRequest?.temperature).toBe(DEFAULT_ROLE_TEMPERATURE.planner);
  });

  it('applies the role-configured temperature over the role default', async () => {
    let seenRequest: LlmTextRequest | undefined;
    const createProvider = () =>
      ok(
        createMockProvider({
          generateText: (request) => {
            seenRequest = request;
            return Promise.resolve(ok({ text: 'ok', finishReason: 'stop' }));
          },
        }),
      );

    const config = fullRoutingConfig();
    config.navigator = roleConfig('navigator-model', { temperature: 0.9 });
    const router = createModelRouter(createProvider, config);
    const provider = router.resolve('navigator');
    await (isOk(provider) && provider.value.generateText({ prompt: 'hi' }));

    expect(seenRequest?.temperature).toBe(0.9);
  });

  it('lets a per-call temperature override both the role config and the default', async () => {
    let seenRequest: LlmTextRequest | undefined;
    const createProvider = () =>
      ok(
        createMockProvider({
          generateText: (request) => {
            seenRequest = request;
            return Promise.resolve(ok({ text: 'ok', finishReason: 'stop' }));
          },
        }),
      );

    const router = createModelRouter(createProvider, fullRoutingConfig());
    const provider = router.resolve('critic');
    await (isOk(provider) && provider.value.generateText({ prompt: 'hi', temperature: 0.42 }));

    expect(seenRequest?.temperature).toBe(0.42);
  });

  it('applies the role-configured maxOutputTokens only when the caller omits it', async () => {
    let seenRequest: LlmTextRequest | undefined;
    const createProvider = () =>
      ok(
        createMockProvider({
          generateText: (request) => {
            seenRequest = request;
            return Promise.resolve(ok({ text: 'ok', finishReason: 'stop' }));
          },
        }),
      );

    const config = fullRoutingConfig();
    config.verifier = roleConfig('verifier-model', { maxOutputTokens: 256 });
    const router = createModelRouter(createProvider, config);
    const provider = router.resolve('verifier');
    await (isOk(provider) && provider.value.generateText({ prompt: 'hi' }));
    expect(seenRequest?.maxOutputTokens).toBe(256);

    await (isOk(provider) && provider.value.generateText({ prompt: 'hi', maxOutputTokens: 999 }));
    expect(seenRequest?.maxOutputTokens).toBe(999);
  });
});

describe('model routing storage round-trip', () => {
  it('returns undefined when nothing has been saved yet', async () => {
    const storage = createMemoryStorage();
    const result = await loadModelRoutingConfig(storage);
    expect(isOk(result) && result.value).toBeUndefined();
  });

  it('round-trips a saved config through the storage port', async () => {
    const storage = createMemoryStorage();
    const config = fullRoutingConfig();

    const saveResult = await saveModelRoutingConfig(storage, config);
    expect(isOk(saveResult)).toBe(true);

    const loadResult = await loadModelRoutingConfig(storage);
    expect(isOk(loadResult) && loadResult.value).toEqual(config);
  });
});

describe('AgentRoleSchema', () => {
  it('accepts every known role', () => {
    for (const role of ['planner', 'navigator', 'verifier', 'critic']) {
      expect(AgentRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it('rejects an unknown role', () => {
    expect(AgentRoleSchema.safeParse('summarizer').success).toBe(false);
  });
});

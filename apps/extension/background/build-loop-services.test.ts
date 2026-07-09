import { saveModelRoutingConfig, type ModelRoutingConfig } from '@aegis/llm';
import { createMemoryStorage, StorageError } from '@aegis/shared';
import { describe, expect, it, vi } from 'vitest';

import { buildLoopServices } from './build-loop-services';

const VALID_CONFIG: ModelRoutingConfig = {
  planner: { provider: { kind: 'ollama', model: 'llama3' } },
  navigator: { provider: { kind: 'ollama', model: 'llama3' } },
  verifier: { provider: { kind: 'ollama', model: 'llama3' } },
  critic: { provider: { kind: 'ollama', model: 'llama3' } },
};

describe('buildLoopServices', () => {
  it('fails with MODEL_ROUTING_NOT_CONFIGURED when nothing has been saved yet', async () => {
    const result = await buildLoopServices(createMemoryStorage(), 1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('MODEL_ROUTING_NOT_CONFIGURED');
  });

  it('fails with STORAGE_FAILED when the underlying storage read errors', async () => {
    const storage = {
      get: () =>
        Promise.resolve({
          ok: false as const,
          error: new StorageError('STORAGE_READ_FAILED', 'disk error'),
        }),
      set: vi.fn(),
      remove: vi.fn(),
    };

    const result = await buildLoopServices(storage, 1);

    expect(!result.ok && result.error.code).toBe('STORAGE_FAILED');
  });

  it('builds a complete LoopServices + ExecutorContext once configured', async () => {
    const storage = createMemoryStorage();
    await saveModelRoutingConfig(storage, VALID_CONFIG);

    const result = await buildLoopServices(storage, 7);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.executorContext.session.tabId).toBe(7);
    expect(typeof result.value.attach).toBe('function');
    expect(typeof result.value.detach).toBe('function');
    expect(typeof result.value.services.perceive).toBe('function');
    expect(typeof result.value.services.plan).toBe('function');
    expect(typeof result.value.services.decide).toBe('function');
    expect(typeof result.value.services.checkPolicy).toBe('function');
    expect(typeof result.value.services.checkAlignment).toBe('function');
    expect(typeof result.value.services.act).toBe('function');
    expect(typeof result.value.services.verify).toBe('function');
  });
});

import type { Worker } from '@playwright/test';

const MODEL_ROUTING_STORAGE_KEY = 'model-routing-config';

/**
 * Seeds `chrome.storage.local` with a `ModelRoutingConfig` (all four agent roles pointed
 * at the same fake local model server) directly through the background service worker's
 * own `chrome.storage` access — bypassing `@aegis/llm`'s `StoragePort`/schema layer
 * entirely, since this runs from outside the extension's module graph. The storage key
 * must match `packages/llm/src/model-routing.ts`'s `MODEL_ROUTING_STORAGE_KEY` exactly.
 */
export async function seedModelRoutingConfig(worker: Worker, modelBaseUrl: string): Promise<void> {
  const provider = {
    kind: 'openai-compatible' as const,
    model: 'fixture-model',
    baseUrl: modelBaseUrl,
  };
  const roleConfig = { provider };
  const config = {
    planner: roleConfig,
    navigator: roleConfig,
    verifier: roleConfig,
    critic: roleConfig,
  };

  await worker.evaluate(([key, value]) => chrome.storage.local.set({ [key]: value }), [
    MODEL_ROUTING_STORAGE_KEY,
    config,
  ] as const);
}

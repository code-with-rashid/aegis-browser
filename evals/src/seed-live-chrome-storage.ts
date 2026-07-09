import type { ProviderConfig } from '@aegis/llm';
import type { Worker } from 'playwright';

const MODEL_ROUTING_STORAGE_KEY = 'model-routing-config';

/** Live mode's equivalent of `@aegis/eval-harness`'s `seedModelRoutingConfig`, for a real, caller-supplied provider rather than the fake local server. */
export async function seedLiveProviderConfig(
  worker: Worker,
  provider: ProviderConfig,
): Promise<void> {
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

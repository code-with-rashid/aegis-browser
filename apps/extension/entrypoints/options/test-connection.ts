import {
  ProviderRegistry,
  type LlmError,
  type LlmTextResult,
  type ProviderConfig,
  type ProviderFactory,
} from '@aegis/llm';
import { isErr, type Result } from '@aegis/shared';

const TEST_PROMPT = 'Reply with exactly one word: OK';
const TEST_TIMEOUT_MS = 15_000;

const defaultRegistry = new ProviderRegistry();

/**
 * Validates a provider config by making one real, minimal `generateText` call.
 * `createProvider` defaults to a real {@link ProviderRegistry} — tests inject a fake
 * to verify the wiring without a live network call or a real API key.
 */
export function testProviderConnection(
  config: ProviderConfig,
  createProvider: ProviderFactory = (c) => defaultRegistry.create(c),
): Promise<Result<LlmTextResult, LlmError>> {
  const providerResult = createProvider(config);
  if (isErr(providerResult)) {
    return Promise.resolve(providerResult);
  }
  return providerResult.value.generateText({ prompt: TEST_PROMPT, timeoutMs: TEST_TIMEOUT_MS });
}

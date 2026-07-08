import type { ProviderConfig } from '../config';
import type { LlmProvider } from '../provider';
import { createOpenAiCompatibleProvider } from './openai-compatible-provider';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';
/** Ollama does not validate the API key on its OpenAI-compatible endpoint. */
const OLLAMA_PLACEHOLDER_KEY = 'ollama';

/**
 * Ollama serves an OpenAI-compatible HTTP endpoint, so this is a thin preset over
 * {@link createOpenAiCompatibleProvider} rather than a dedicated SDK dependency.
 * See `docs/adr/0001-ollama-via-openai-compatible.md`.
 */
export function createOllamaProvider(
  config: Extract<ProviderConfig, { kind: 'ollama' }>,
): LlmProvider {
  const provider = createOpenAiCompatibleProvider({
    kind: 'openai-compatible',
    baseUrl: config.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
    model: config.model,
    apiKey: OLLAMA_PLACEHOLDER_KEY,
  });

  return { ...provider, id: `ollama:${config.model}` };
}

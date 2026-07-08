import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import type { ProviderConfig } from '../config';
import { runGenerateText } from '../generate-text';
import type { LlmProvider } from '../provider';

export function createOpenAiCompatibleProvider(
  config: Extract<ProviderConfig, { kind: 'openai-compatible' }>,
): LlmProvider {
  const provider = createOpenAICompatible({
    name: 'openai-compatible',
    baseURL: config.baseUrl,
    ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
  });
  const model = provider(config.model);

  return {
    id: `openai-compatible:${config.model}`,
    generateText: (request) => runGenerateText(model, request),
  };
}

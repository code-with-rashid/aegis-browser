import { createAnthropic } from '@ai-sdk/anthropic';

import type { ProviderConfig } from '../config';
import { runGenerateText } from '../generate-text';
import type { LlmProvider } from '../provider';

export function createAnthropicProvider(
  config: Extract<ProviderConfig, { kind: 'anthropic' }>,
): LlmProvider {
  const provider = createAnthropic({ apiKey: config.apiKey });
  const model = provider(config.model);

  return {
    id: `anthropic:${config.model}`,
    generateText: (request) => runGenerateText(model, request),
  };
}

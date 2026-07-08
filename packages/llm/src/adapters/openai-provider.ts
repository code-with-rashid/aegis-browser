import { createOpenAI } from '@ai-sdk/openai';

import type { ProviderConfig } from '../config';
import { runGenerateText } from '../generate-text';
import type { LlmProvider } from '../provider';

export function createOpenAiProvider(
  config: Extract<ProviderConfig, { kind: 'openai' }>,
): LlmProvider {
  const provider = createOpenAI({ apiKey: config.apiKey });
  const model = provider(config.model);

  return {
    id: `openai:${config.model}`,
    generateText: (request) => runGenerateText(model, request),
  };
}

import { createGoogleGenerativeAI } from '@ai-sdk/google';

import type { ProviderConfig } from '../config';
import { runGenerateText } from '../generate-text';
import type { LlmProvider } from '../provider';

export function createGoogleProvider(
  config: Extract<ProviderConfig, { kind: 'google' }>,
): LlmProvider {
  const provider = createGoogleGenerativeAI({ apiKey: config.apiKey });
  const model = provider(config.model);

  return {
    id: `google:${config.model}`,
    generateText: (request) => runGenerateText(model, request),
  };
}

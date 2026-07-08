import { err, ok, type Result } from '@aegis/shared';

import { createAnthropicProvider } from './adapters/anthropic-provider';
import { createGoogleProvider } from './adapters/google-provider';
import { createOllamaProvider } from './adapters/ollama-provider';
import { createOpenAiCompatibleProvider } from './adapters/openai-compatible-provider';
import { createOpenAiProvider } from './adapters/openai-provider';
import { ProviderConfigSchema, type ProviderConfig } from './config';
import { LlmError, type LlmProvider } from './provider';

function assertNever(value: never): never {
  throw new LlmError('LLM_INVALID_CONFIG', `Unhandled provider kind: ${JSON.stringify(value)}`);
}

/** Resolves a validated {@link ProviderConfig} into a working {@link LlmProvider}. */
export class ProviderRegistry {
  create(config: ProviderConfig): Result<LlmProvider, LlmError> {
    const parsed = ProviderConfigSchema.safeParse(config);
    if (!parsed.success) {
      return err(
        new LlmError('LLM_INVALID_CONFIG', `Invalid provider config: ${parsed.error.message}`, {
          cause: parsed.error,
        }),
      );
    }

    switch (parsed.data.kind) {
      case 'openai':
        return ok(createOpenAiProvider(parsed.data));
      case 'anthropic':
        return ok(createAnthropicProvider(parsed.data));
      case 'google':
        return ok(createGoogleProvider(parsed.data));
      case 'ollama':
        return ok(createOllamaProvider(parsed.data));
      case 'openai-compatible':
        return ok(createOpenAiCompatibleProvider(parsed.data));
      default:
        return assertNever(parsed.data);
    }
  }
}

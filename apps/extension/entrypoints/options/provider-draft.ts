import { ProviderConfigSchema, type ProviderConfig } from '@aegis/llm';

/** A provider config's fields flattened to strings, matching how form inputs hold values. */
export interface ProviderDraft {
  readonly kind: ProviderConfig['kind'];
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
}

export const EMPTY_PROVIDER_DRAFT: ProviderDraft = {
  kind: 'openai',
  apiKey: '',
  model: '',
  baseUrl: '',
};

export const PROVIDER_KIND_LABELS: Readonly<Record<ProviderConfig['kind'], string>> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  ollama: 'Ollama (local)',
  'openai-compatible': 'OpenAI-compatible',
};

/** Flattens a saved {@link ProviderConfig} into an editable {@link ProviderDraft}. */
export function draftFromConfig(config: ProviderConfig | undefined): ProviderDraft {
  if (config === undefined) {
    return EMPTY_PROVIDER_DRAFT;
  }
  switch (config.kind) {
    case 'openai':
    case 'anthropic':
    case 'google':
      return { kind: config.kind, apiKey: config.apiKey, model: config.model, baseUrl: '' };
    case 'ollama':
      return { kind: 'ollama', apiKey: '', model: config.model, baseUrl: config.baseUrl ?? '' };
    case 'openai-compatible':
      return {
        kind: 'openai-compatible',
        apiKey: config.apiKey ?? '',
        model: config.model,
        baseUrl: config.baseUrl,
      };
  }
}

/** Validates a {@link ProviderDraft} into a real {@link ProviderConfig}, or `undefined` while incomplete/invalid. */
export function toProviderConfig(draft: ProviderDraft): ProviderConfig | undefined {
  const trimmedBaseUrl = draft.baseUrl.trim();
  const trimmedApiKey = draft.apiKey.trim();

  const candidate: unknown = (() => {
    switch (draft.kind) {
      case 'openai':
        return { kind: 'openai', apiKey: draft.apiKey, model: draft.model };
      case 'anthropic':
        return { kind: 'anthropic', apiKey: draft.apiKey, model: draft.model };
      case 'google':
        return { kind: 'google', apiKey: draft.apiKey, model: draft.model };
      case 'ollama':
        return {
          kind: 'ollama',
          model: draft.model,
          ...(trimmedBaseUrl.length > 0 ? { baseUrl: draft.baseUrl } : {}),
        };
      case 'openai-compatible':
        return {
          kind: 'openai-compatible',
          model: draft.model,
          baseUrl: draft.baseUrl,
          ...(trimmedApiKey.length > 0 ? { apiKey: draft.apiKey } : {}),
        };
    }
  })();

  const parsed = ProviderConfigSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

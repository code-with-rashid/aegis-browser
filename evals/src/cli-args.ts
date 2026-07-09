import type { ProviderConfig } from '@aegis/llm';

export interface CliArgs {
  readonly mode: 'mock' | 'live';
  readonly providerKind?: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

const ARG_PATTERN = /^--([a-z-]+)=(.*)$/;

/** Parses `--key=value` CLI arguments (e.g. `--mode=live --provider-kind=openai`). Unrecognized/malformed args are ignored. */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  const raw: Record<string, string> = {};
  for (const arg of argv) {
    const match = ARG_PATTERN.exec(arg);
    if (match) {
      const [, key, value] = match;
      if (key !== undefined && value !== undefined) {
        raw[key] = value;
      }
    }
  }

  return {
    mode: raw['mode'] === 'live' ? 'live' : 'mock',
    ...(raw['provider-kind'] !== undefined ? { providerKind: raw['provider-kind'] } : {}),
    ...(raw['api-key'] !== undefined ? { apiKey: raw['api-key'] } : {}),
    ...(raw['model'] !== undefined ? { model: raw['model'] } : {}),
    ...(raw['base-url'] !== undefined ? { baseUrl: raw['base-url'] } : {}),
  };
}

/**
 * Builds a real {@link ProviderConfig} for live mode from parsed CLI args — never
 * defaults a provider or reads a credential from anywhere but the explicit `--api-key`
 * flag, so a live run only ever uses a key the caller deliberately supplied.
 */
export function resolveLiveProviderConfig(args: CliArgs): ProviderConfig {
  if (args.providerKind === undefined || args.model === undefined) {
    throw new Error(
      'Live mode requires --provider-kind and --model (e.g. --provider-kind=openai --model=gpt-4o-mini --api-key=...).',
    );
  }

  switch (args.providerKind) {
    case 'openai':
    case 'anthropic':
    case 'google': {
      if (args.apiKey === undefined) {
        throw new Error(`--provider-kind=${args.providerKind} requires --api-key`);
      }
      return { kind: args.providerKind, apiKey: args.apiKey, model: args.model };
    }
    case 'ollama':
      return {
        kind: 'ollama',
        model: args.model,
        ...(args.baseUrl !== undefined ? { baseUrl: args.baseUrl } : {}),
      };
    case 'openai-compatible': {
      if (args.baseUrl === undefined) {
        throw new Error('--provider-kind=openai-compatible requires --base-url');
      }
      return {
        kind: 'openai-compatible',
        model: args.model,
        baseUrl: args.baseUrl,
        ...(args.apiKey !== undefined ? { apiKey: args.apiKey } : {}),
      };
    }
    default:
      throw new Error(
        `Unknown --provider-kind "${args.providerKind}" (expected openai, anthropic, google, ollama, or openai-compatible)`,
      );
  }
}

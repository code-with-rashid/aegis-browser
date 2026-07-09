import { generateStructured, type GenerateStructuredOptions, type ModelRouter } from '@aegis/llm';
import { err, isErr, ok } from '@aegis/shared';

import { AgentError } from '../loop/errors';
import type { CriticCheckInput, CriticCheckOutput, CriticService } from '../loop/services';
import type { SanitizeText } from '../sanitize';
import { buildCriticPrompt, CRITIC_SYSTEM_PROMPT } from './prompt';
import { CriticOutputSchema } from './schema';

export interface CreateCriticServiceOptions {
  readonly sanitize?: SanitizeText;
  readonly generateStructuredOptions?: GenerateStructuredOptions;
}

/**
 * Builds the {@link CriticService}: an independent model pass, always called (unlike the
 * Verifier, alignment can't be shortcut by a mechanical heuristic — it's a semantic
 * judgment), against the cheap `critic` role.
 */
export function createCriticService(
  modelRouter: ModelRouter,
  options: CreateCriticServiceOptions = {},
): CriticService {
  return async (input: CriticCheckInput, signal?: AbortSignal) => {
    const providerResult = modelRouter.resolve('critic');
    if (isErr(providerResult)) {
      return err(
        new AgentError('CRITIC_FAILED', 'Could not resolve a provider for the critic role', {
          cause: providerResult.error,
        }),
      );
    }

    const prompt = buildCriticPrompt(
      input,
      options.sanitize !== undefined ? { sanitize: options.sanitize } : {},
    );
    const result = await generateStructured(providerResult.value, CriticOutputSchema, prompt, {
      system: CRITIC_SYSTEM_PROMPT,
      ...(signal !== undefined ? { signal } : {}),
      ...options.generateStructuredOptions,
    });
    if (isErr(result)) {
      return err(
        new AgentError('CRITIC_FAILED', 'Critic failed to produce valid output', {
          cause: result.error,
        }),
      );
    }

    const output: CriticCheckOutput = {
      aligned: result.value.aligned,
      reasoning: result.value.reasoning,
    };
    return ok(output);
  };
}

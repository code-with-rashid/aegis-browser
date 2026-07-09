import { ActionSchema } from '@aegis/actions';
import { generateStructured, type GenerateStructuredOptions, type ModelRouter } from '@aegis/llm';
import { err, isErr, ok } from '@aegis/shared';
import { z } from 'zod';

import { AgentError } from '../loop/errors';
import type { DecideInput, DecideOutput, NavigatorService } from '../loop/services';
import type { SanitizeText } from '../sanitize';
import { findHallucinatedRefs } from './hallucinated-refs';
import { buildNavigatorPrompt, NAVIGATOR_SYSTEM_PROMPT } from './prompt';
import { NavigatorOutputSchema } from './schema';

const ActionListSchema = z.array(ActionSchema);

const MAX_REF_CORRECTION_ATTEMPTS = 2;

export interface CreateNavigatorServiceOptions {
  readonly sanitize?: SanitizeText;
  readonly generateStructuredOptions?: GenerateStructuredOptions;
}

function correctionFor(invalidRefs: readonly string[]): string {
  return [
    'Your previous response referenced ref(s) that do not exist on this page:',
    invalidRefs.join(', '),
    'Only use refs listed under "Available elements" above, copied verbatim.',
  ].join(' ');
}

/**
 * Builds the {@link NavigatorService}: chooses the next 1-4 actions via
 * `generateStructured` against the `navigator` role's (low-temperature) model,
 * consuming only sanitized perception. Every action is schema-validated
 * ({@link NavigatorOutputSchema}); any that reference a ref not present in the given
 * perception are rejected as hallucinated, and the model gets one corrective retry
 * before the whole decision is treated as `stuck` (triggering a replan, not a hard
 * failure — the model got confused, not the infrastructure).
 */
export function createNavigatorService(
  modelRouter: ModelRouter,
  options: CreateNavigatorServiceOptions = {},
): NavigatorService {
  return async (input: DecideInput) => {
    const providerResult = modelRouter.resolve('navigator');
    if (isErr(providerResult)) {
      return err(
        new AgentError('NAVIGATOR_FAILED', 'Could not resolve a provider for the navigator role', {
          cause: providerResult.error,
        }),
      );
    }

    let correction: string | undefined;

    for (let attempt = 0; ; attempt += 1) {
      const prompt = buildNavigatorPrompt(input, {
        ...(options.sanitize !== undefined ? { sanitize: options.sanitize } : {}),
        ...(correction !== undefined ? { correction } : {}),
      });

      const result = await generateStructured(providerResult.value, NavigatorOutputSchema, prompt, {
        system: NAVIGATOR_SYSTEM_PROMPT,
        ...options.generateStructuredOptions,
      });
      if (isErr(result)) {
        return err(
          new AgentError('NAVIGATOR_FAILED', 'Navigator failed to produce valid output', {
            cause: result.error,
          }),
        );
      }

      const actionsResult = ActionListSchema.safeParse(result.value.actions);
      if (!actionsResult.success) {
        return err(
          new AgentError('NAVIGATOR_FAILED', 'Navigator actions did not convert to valid actions', {
            cause: actionsResult.error,
          }),
        );
      }
      const actions = actionsResult.data;

      const invalidRefs = findHallucinatedRefs(actions, input.perception);
      if (invalidRefs.length === 0) {
        const output: DecideOutput = {
          actions,
          stuck: false,
          observation: result.value.observation,
          reasoning: result.value.reasoning,
          memory: result.value.memory,
        };
        return ok(output);
      }

      if (attempt >= MAX_REF_CORRECTION_ATTEMPTS) {
        return ok({ actions: [], stuck: true });
      }
      correction = correctionFor(invalidRefs);
    }
  };
}

import { generateStructured, type GenerateStructuredOptions, type ModelRouter } from '@aegis/llm';
import { err, isErr, ok } from '@aegis/shared';

import { AgentError } from '../loop/errors';
import type { VerifierService, VerifyInput, VerifyOutput } from '../loop/services';
import type { SanitizeText } from '../sanitize';
import { buildVerifierPrompt, VERIFIER_SYSTEM_PROMPT } from './prompt';
import { VerifierOutputSchema } from './schema';

export interface CreateVerifierServiceOptions {
  readonly sanitize?: SanitizeText;
  readonly generateStructuredOptions?: GenerateStructuredOptions;
}

/**
 * Builds the {@link VerifierService}: a heuristic pre-check backed by a cheap-model
 * fallback (`docs/DESIGN.md` §5: "cheap model or heuristic" — this does both).
 *
 * The heuristic: if any action in the run didn't mechanically succeed, the sub-goal
 * plainly wasn't achieved — no model call needed, `outcome: 'failed'` immediately (a
 * dead end for this approach; the loop replans rather than repeating it).
 *
 * Only when every action succeeded does it ask the `verifier` role's (cheap,
 * low-temperature) model whether the sub-goal's *intent* was actually satisfied against
 * fresh perception — this is what catches "declared success but nothing happened," the
 * failure class a purely mechanical check can't see.
 */
export function createVerifierService(
  modelRouter: ModelRouter,
  options: CreateVerifierServiceOptions = {},
): VerifierService {
  return async (input: VerifyInput) => {
    if (
      input.runSummary.kind !== 'completed' ||
      input.runSummary.actions.some((a) => !a.succeeded)
    ) {
      const output: VerifyOutput = { outcome: 'failed', taskComplete: false };
      return ok(output);
    }

    const providerResult = modelRouter.resolve('verifier');
    if (isErr(providerResult)) {
      return err(
        new AgentError('VERIFIER_FAILED', 'Could not resolve a provider for the verifier role', {
          cause: providerResult.error,
        }),
      );
    }

    const prompt = buildVerifierPrompt(
      input,
      options.sanitize !== undefined ? { sanitize: options.sanitize } : {},
    );
    const result = await generateStructured(providerResult.value, VerifierOutputSchema, prompt, {
      system: VERIFIER_SYSTEM_PROMPT,
      ...options.generateStructuredOptions,
    });
    if (isErr(result)) {
      return err(
        new AgentError('VERIFIER_FAILED', 'Verifier failed to produce valid output', {
          cause: result.error,
        }),
      );
    }

    const llmOutput = result.value;
    const output: VerifyOutput = {
      outcome: llmOutput.subGoalAchieved ? 'achieved' : 'continue',
      taskComplete: llmOutput.subGoalAchieved && llmOutput.taskComplete,
      reasoning: llmOutput.reasoning,
    };
    return ok(output);
  };
}

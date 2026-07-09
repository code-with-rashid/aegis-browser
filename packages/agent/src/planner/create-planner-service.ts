import { generateStructured, type GenerateStructuredOptions, type ModelRouter } from '@aegis/llm';
import { err, isErr, ok } from '@aegis/shared';

import { AgentError } from '../loop/errors';
import type { PlanInput, PlanOutput, PlannerService } from '../loop/services';
import type { SanitizeText } from '../sanitize';
import { buildPlannerPrompt, PLANNER_SYSTEM_PROMPT } from './prompt';
import { PlannerOutputSchema } from './schema';

export interface CreatePlannerServiceOptions {
  readonly sanitize?: SanitizeText;
  readonly generateStructuredOptions?: GenerateStructuredOptions;
}

/**
 * Builds the {@link PlannerService}: decomposes the task and decides sub-goals/done-ness
 * via `generateStructured` against the `planner` role's (higher-temperature) model,
 * consuming only sanitized perception (`sanitize` — a pass-through until #20's real
 * content sanitizer is wired in at the composition root).
 */
export function createPlannerService(
  modelRouter: ModelRouter,
  options: CreatePlannerServiceOptions = {},
): PlannerService {
  return async (input: PlanInput) => {
    const providerResult = modelRouter.resolve('planner');
    if (isErr(providerResult)) {
      return err(
        new AgentError('PLANNER_FAILED', 'Could not resolve a provider for the planner role', {
          cause: providerResult.error,
        }),
      );
    }

    const prompt = buildPlannerPrompt(
      input,
      options.sanitize !== undefined ? { sanitize: options.sanitize } : {},
    );
    const result = await generateStructured(providerResult.value, PlannerOutputSchema, prompt, {
      system: PLANNER_SYSTEM_PROMPT,
      ...options.generateStructuredOptions,
    });
    if (isErr(result)) {
      return err(
        new AgentError('PLANNER_FAILED', 'Planner failed to produce a valid plan', {
          cause: result.error,
        }),
      );
    }

    const llmOutput = result.value;
    const planOutput: PlanOutput = {
      subGoal: llmOutput.nextGoal,
      taskComplete: llmOutput.taskComplete,
      plan: llmOutput.plan,
      reasoning: llmOutput.reasoning,
      memory: llmOutput.memory,
      ...(llmOutput.summary !== undefined ? { summary: llmOutput.summary } : {}),
    };
    return ok(planOutput);
  };
}

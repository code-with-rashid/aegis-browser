import type { ToolRegistry } from '@aegis/actions';
import { generateStructured, type GenerateStructuredOptions, type ModelRouter } from '@aegis/llm';
import { err, isErr, ok } from '@aegis/shared';

import { AgentError } from '../loop/errors';
import type { DecideInput, DecideOutput, NavigatorService } from '../loop/services';
import type { SanitizeText } from '../sanitize';
import { findHallucinatedRefs } from './hallucinated-refs';
import { buildNavigatorPrompt, NAVIGATOR_SYSTEM_PROMPT } from './prompt';
import { resolveToolCalls, type ToolCallResolutionIssue } from './resolve-tool-calls';
import { NavigatorOutputSchema } from './schema';

const MAX_REF_CORRECTION_ATTEMPTS = 2;

export interface CreateNavigatorServiceOptions {
  readonly sanitize?: SanitizeText;
  readonly generateStructuredOptions?: GenerateStructuredOptions;
}

function correctionForRefs(invalidRefs: readonly string[]): string {
  return [
    'Your previous response referenced ref(s) that do not exist on this page:',
    invalidRefs.join(', '),
    'Only use refs listed under "Available elements" above, copied verbatim.',
  ].join(' ');
}

function correctionForIssues(issues: readonly ToolCallResolutionIssue[]): string {
  return [
    'Your previous response had invalid tool call(s):',
    issues.map((issue) => `"${issue.toolId}" (${issue.reason})`).join('; '),
    'Only call tool ids listed under "Available tools" above, with args matching that',
    "tool's schema exactly.",
  ].join(' ');
}

/**
 * Builds the {@link NavigatorService}: chooses the next 1-4 tool calls via
 * `generateStructured` against the `navigator` role's (low-temperature) model,
 * consuming only sanitized perception and the tools registered on `toolRegistry`
 * (re-listed fresh on every call, so a dynamically-changing registry — e.g. a WebMCP
 * tool appearing/disappearing per page, #87 — is always reflected). Every tool call is
 * validated against its tool's own `inputSchema` (`resolve-tool-calls.ts`); any that
 * reference an unknown tool, fail that validation, or (for `source: "browser"` tools)
 * reference a ref not present in the given perception are rejected and the model gets one
 * corrective retry before the whole decision is treated as `stuck` (triggering a replan,
 * not a hard failure — the model got confused, not the infrastructure).
 */
export function createNavigatorService(
  modelRouter: ModelRouter,
  toolRegistry: ToolRegistry,
  options: CreateNavigatorServiceOptions = {},
): NavigatorService {
  return async (input: DecideInput, signal?: AbortSignal) => {
    const providerResult = modelRouter.resolve('navigator');
    if (isErr(providerResult)) {
      return err(
        new AgentError('NAVIGATOR_FAILED', 'Could not resolve a provider for the navigator role', {
          cause: providerResult.error,
        }),
      );
    }

    const tools = toolRegistry.list();
    let correction: string | undefined;

    for (let attempt = 0; ; attempt += 1) {
      const prompt = buildNavigatorPrompt(input, {
        tools,
        ...(options.sanitize !== undefined ? { sanitize: options.sanitize } : {}),
        ...(correction !== undefined ? { correction } : {}),
      });

      const result = await generateStructured(providerResult.value, NavigatorOutputSchema, prompt, {
        system: NAVIGATOR_SYSTEM_PROMPT,
        ...(signal !== undefined ? { signal } : {}),
        ...options.generateStructuredOptions,
      });
      if (isErr(result)) {
        return err(
          new AgentError('NAVIGATOR_FAILED', 'Navigator failed to produce valid output', {
            cause: result.error,
          }),
        );
      }

      const resolved = resolveToolCalls(result.value.toolCalls, toolRegistry);
      if (isErr(resolved)) {
        if (attempt >= MAX_REF_CORRECTION_ATTEMPTS) {
          return ok({ actions: [], toolCalls: [], stuck: true });
        }
        correction = correctionForIssues(resolved.error);
        continue;
      }

      const invalidRefs = findHallucinatedRefs(resolved.value.actions, input.perception);
      if (invalidRefs.length === 0) {
        const output: DecideOutput = {
          actions: resolved.value.actions,
          toolCalls: resolved.value.toolCalls,
          stuck: false,
          observation: result.value.observation,
          reasoning: result.value.reasoning,
          memory: result.value.memory,
        };
        return ok(output);
      }

      if (attempt >= MAX_REF_CORRECTION_ATTEMPTS) {
        return ok({ actions: [], toolCalls: [], stuck: true });
      }
      correction = correctionForRefs(invalidRefs);
    }
  };
}

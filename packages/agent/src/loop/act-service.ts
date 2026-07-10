import {
  ToolExecutionError,
  type Action,
  type ActionExecutionError,
  type ActionResult,
  type ActionRunner,
  type ExecutorContext,
  type ToolRegistry,
  type ToolResult,
} from '@aegis/actions';
import { err, isErr, ok, type Result } from '@aegis/shared';

import type { ActService, ToolCallRunResult } from './services';

const BROWSER_TOOL_PREFIX = 'browser.';

function isBrowserToolId(toolId: string): boolean {
  return toolId.startsWith(BROWSER_TOOL_PREFIX);
}

/** Wraps an `executeAction`-shaped outcome (via {@link ActionRunner}) as a {@link ToolResult}, matching how `@aegis/actions`' `browser-tools.ts` wraps the same call when it goes through `ToolRegistry.call` directly. */
function toToolResult(outcome: Result<ActionResult, ActionExecutionError>): ToolResult {
  if (isErr(outcome)) {
    return err(
      new ToolExecutionError('TOOL_EXECUTION_FAILED', outcome.error.message, {
        cause: outcome.error,
      }),
    );
  }
  return ok(outcome.value);
}

/**
 * Creates the real {@link ActService} (#81): every tool call runs through `registry`, the
 * single execution surface any tool source (browser, MCP #85, WebMCP #87) implements.
 * Browser-sourced calls are additionally routed through `actionRunner` — the existing,
 * tested {@link ActionRunner} — one call at a time, so its cross-call retry/stall/history
 * behavior (`@aegis/actions`, #14) is preserved exactly, unchanged, rather than
 * reimplemented here. Non-browser tool calls (an MCP/WebMCP/mock tool) go straight through
 * `registry.call` — no retry/stall semantics yet, since those were built specifically
 * around CDP flakiness, not a generic tool-call concern.
 */
export function createToolCallActService(
  actionRunner: ActionRunner,
  registry: ToolRegistry,
): ActService {
  return async (toolCalls, context: ExecutorContext, signal) => {
    const results: ToolCallRunResult[] = [];

    for (const toolCall of toolCalls) {
      if (signal?.aborted) {
        return { kind: 'aborted', results };
      }

      if (isBrowserToolId(toolCall.toolId)) {
        const runOutcome = await actionRunner.run(
          [toolCall.args as Action],
          context,
          signal !== undefined ? { signal } : {},
        );
        const runResult = runOutcome.results[0];
        if (runResult !== undefined) {
          results.push({
            toolCall,
            attempt: runResult.attempt,
            outcome: toToolResult(runResult.outcome),
          });
        }

        if (runOutcome.kind === 'stalled') {
          return { kind: 'stalled', results, stalledOn: toolCall };
        }
        if (runOutcome.kind === 'aborted') {
          return { kind: 'aborted', results };
        }
        if (runOutcome.kind === 'failed') {
          return { kind: 'failed', results, failedToolCall: toolCall };
        }
        continue;
      }

      const outcome = await registry.call(toolCall.toolId, toolCall.args, context);
      results.push({ toolCall, attempt: 1, outcome });
      if (isErr(outcome)) {
        return { kind: 'failed', results, failedToolCall: toolCall };
      }
    }

    return { kind: 'completed', results };
  };
}

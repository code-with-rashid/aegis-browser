import type { Action, ToolRegistry } from '@aegis/actions';
import { err, ok, type Result } from '@aegis/shared';

import type { ToolCall } from '../loop/services';

/** A raw `{toolId, args}` pair as the model produced it, before validation. */
export interface RawToolCall {
  readonly toolId: string;
  readonly args: unknown;
}

/** Why one raw tool call couldn't be resolved — an unknown `toolId`, or `args` that don't satisfy that tool's `inputSchema`. */
export interface ToolCallResolutionIssue {
  readonly toolId: string;
  readonly reason: string;
}

export interface ResolvedToolCalls {
  /** Every call, validated, args parsed through its tool's own `inputSchema`. */
  readonly toolCalls: readonly ToolCall[];
  /** The `source: "browser"` subset, re-parsed as real `Action`s — see `DecideOutput.actions`. */
  readonly actions: readonly Action[];
}

/**
 * Resolves the Navigator's raw tool calls against `registry`: an unknown `toolId` or
 * schema-invalid `args` is collected as a {@link ToolCallResolutionIssue} rather than
 * thrown, so `create-navigator-service.ts` can fold it into the same corrective-retry
 * loop it already uses for hallucinated refs. Never partially succeeds — any issue fails
 * the whole batch, since a Navigator turn is only as good as its worst call.
 */
export function resolveToolCalls(
  rawCalls: readonly RawToolCall[],
  registry: ToolRegistry,
): Result<ResolvedToolCalls, readonly ToolCallResolutionIssue[]> {
  const toolCalls: ToolCall[] = [];
  const actions: Action[] = [];
  const issues: ToolCallResolutionIssue[] = [];

  for (const raw of rawCalls) {
    const tool = registry.get(raw.toolId);
    if (!tool) {
      issues.push({ toolId: raw.toolId, reason: `Unknown tool "${raw.toolId}"` });
      continue;
    }

    const parsed = tool.inputSchema.safeParse(raw.args);
    if (!parsed.success) {
      issues.push({ toolId: raw.toolId, reason: `Invalid args: ${parsed.error.message}` });
      continue;
    }

    toolCalls.push({ toolId: raw.toolId, args: parsed.data });
    if (tool.source === 'browser') {
      actions.push(parsed.data as Action);
    }
  }

  if (issues.length > 0) {
    return err(issues);
  }
  return ok({ toolCalls, actions });
}

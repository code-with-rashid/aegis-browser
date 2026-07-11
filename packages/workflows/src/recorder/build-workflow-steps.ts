import { targetRefOf, type Action } from '@aegis/actions';
import type { RunSummary, ToolCall } from '@aegis/agent';
import type { CdpSession, PerceptionPayload } from '@aegis/perception';

import type { WorkflowStepId } from '../ids';
import type { WorkflowStep, WorkflowTarget } from '../schema';
import { deriveSelector } from './derive-selector';

/** The subset of a loop snapshot's context a recording needs — deliberately narrower than the full `AgentLoopContext`, so this package only depends on the shape it actually reads. */
export interface RecordableStepInput {
  readonly proposedToolCalls: readonly ToolCall[];
  readonly lastRunSummary: RunSummary | undefined;
  readonly perception: PerceptionPayload | undefined;
}

async function buildTarget(
  toolCall: ToolCall,
  perception: PerceptionPayload | undefined,
  session: CdpSession,
): Promise<WorkflowTarget | undefined> {
  const ref = targetRefOf(toolCall.args as Action);
  if (ref === undefined) {
    return undefined;
  }

  const element = perception?.elements.find((candidate) => candidate.ref === ref);
  const selector = await deriveSelector(session, ref);

  return {
    ref,
    ...(selector !== undefined ? { selector } : {}),
    ...(element?.role !== undefined ? { role: element.role } : {}),
    ...(element?.name !== undefined && element.name.length > 0 ? { name: element.name } : {}),
  };
}

/**
 * Builds the `WorkflowStep`s one completed `acting` cycle contributes to a recording —
 * mirrors `@aegis/agent`'s own `buildTraceStep`: correlates `lastRunSummary.toolCalls`
 * (outcome, no args) with `proposedToolCalls` (the real args) *by index*, the only
 * alignment guaranteed to hold (`trace.ts` carries the identical warning against using a
 * browser-only `actions` view for this). Only `succeeded` calls are recorded — a step
 * that failed isn't something to blindly replay later. `perception` must be the same
 * snapshot the Navigator decided against (read at the same "verifying exits" instant
 * `buildTraceStep` reads it) — a later perception would resolve refs against the wrong
 * page state.
 */
export async function buildWorkflowSteps(
  input: RecordableStepInput,
  session: CdpSession,
  nextStepId: () => WorkflowStepId,
): Promise<WorkflowStep[]> {
  if (input.lastRunSummary === undefined) {
    return [];
  }

  const steps: WorkflowStep[] = [];
  for (const [index, outcome] of input.lastRunSummary.toolCalls.entries()) {
    if (!outcome.succeeded) {
      continue;
    }
    const toolCall = input.proposedToolCalls[index];
    if (toolCall === undefined) {
      continue;
    }

    const target = await buildTarget(toolCall, input.perception, session);
    steps.push({
      stepId: nextStepId(),
      toolId: toolCall.toolId,
      args: toolCall.args,
      ...(target !== undefined ? { target } : {}),
    });
  }
  return steps;
}

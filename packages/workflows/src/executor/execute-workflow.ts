import type { ToolContext, ToolRegistry } from '@aegis/actions';
import type { CdpSession } from '@aegis/perception';

import type { WorkflowStepId } from '../ids';
import type { WorkflowStep } from '../schema';
import { resolveStepTarget } from './resolve-target';

/** The outcome of executing one step — a typed success/failure record, not a thrown error, so a caller can inspect every step attempted so far even after a failure stops the run. */
export interface WorkflowStepResult {
  readonly stepId: WorkflowStepId;
  readonly toolId: string;
  readonly succeeded: boolean;
  readonly errorMessage?: string;
}

/** How a deterministic replay ended. `failed`/`aborted` still carry every step result completed before stopping. */
export type WorkflowRunOutcome =
  | { readonly kind: 'completed'; readonly steps: readonly WorkflowStepResult[] }
  | {
      readonly kind: 'failed';
      readonly steps: readonly WorkflowStepResult[];
      readonly failedStepId: WorkflowStepId;
    }
  | { readonly kind: 'aborted'; readonly steps: readonly WorkflowStepResult[] };

/**
 * Replays already-parameter-resolved `steps` in order, via CDP, with **no LLM calls at
 * all** — the deterministic fast path a recorded `Workflow` earns over re-invoking the
 * planner every run (#111). Each step is re-targeted for the current page
 * (`resolveStepTarget`) then run straight through `ToolRegistry.call` — the same generic
 * dispatch the live agent loop's `ActService` uses for a non-browser tool, reused here
 * for every tool regardless of source, since a deterministic replay has no need for the
 * agent loop's own retry/stall machinery (`ActionRunner`) — a step's failure here means
 * "the page changed since recording," which retrying won't fix; only a self-heal pass
 * (#113) can. Stops at the first failed step; checks `signal` between steps (not
 * mid-step) so `abort()` after a step has already started still lets that one finish
 * rather than leaving it in an unknown state.
 */
export async function executeWorkflow(
  steps: readonly WorkflowStep[],
  registry: ToolRegistry,
  ctx: ToolContext,
  session: CdpSession,
  signal?: AbortSignal,
): Promise<WorkflowRunOutcome> {
  const results: WorkflowStepResult[] = [];

  for (const step of steps) {
    if (signal?.aborted === true) {
      return { kind: 'aborted', steps: results };
    }

    const targeted = await resolveStepTarget(step, session);
    if (!targeted.ok) {
      results.push({
        stepId: step.stepId,
        toolId: step.toolId,
        succeeded: false,
        errorMessage: targeted.error.message,
      });
      return { kind: 'failed', steps: results, failedStepId: step.stepId };
    }

    const callResult = await registry.call(targeted.value.toolId, targeted.value.args, ctx);
    if (!callResult.ok) {
      results.push({
        stepId: step.stepId,
        toolId: step.toolId,
        succeeded: false,
        errorMessage: callResult.error.message,
      });
      return { kind: 'failed', steps: results, failedStepId: step.stepId };
    }

    results.push({ stepId: step.stepId, toolId: step.toolId, succeeded: true });
  }

  return { kind: 'completed', steps: results };
}

import type { ToolContext, ToolRegistry } from '@aegis/actions';
import type { CdpSession } from '@aegis/perception';

import type { WorkflowStepId } from '../ids';
import type { WorkflowStep } from '../schema';
import { evaluatePostCondition } from './evaluate-post-condition';
import { resolveStepTarget } from './resolve-target';

/** The outcome of executing one step — a typed success/failure record, not a thrown error, so a caller can inspect every step attempted so far even after a failure stops the run. `output` is the tool's own result value (e.g. an `extract` step's read text), captured whenever the tool call itself succeeded, whether or not the step's `expect` later failed. */
export interface WorkflowStepResult {
  readonly stepId: WorkflowStepId;
  readonly toolId: string;
  readonly succeeded: boolean;
  readonly errorMessage?: string;
  readonly output?: unknown;
}

/**
 * Why a step needs healing (#113's job to act on) — distinct from `WorkflowStepResult`'s
 * plain `errorMessage` since a caller deciding *how* to recover (retarget the step, replan
 * it, or give up) needs to know *which* of the three ways a replay can fail this was:
 * the target couldn't be resolved, the tool itself reported failure, or the tool ran but
 * its effect didn't verify.
 */
export type NeedsHealingReason = 'target_not_found' | 'tool_call_failed' | 'post_condition_failed';

/** A typed signal carried on a `failed` outcome — this issue only detects and reports it; #113 consumes it to attempt a repair. */
export interface NeedsHealingSignal {
  readonly stepId: WorkflowStepId;
  readonly reason: NeedsHealingReason;
  readonly message: string;
}

/** How a deterministic replay ended. `failed`/`aborted` still carry every step result completed before stopping. */
export type WorkflowRunOutcome =
  | { readonly kind: 'completed'; readonly steps: readonly WorkflowStepResult[] }
  | {
      readonly kind: 'failed';
      readonly steps: readonly WorkflowStepResult[];
      readonly failedStepId: WorkflowStepId;
      readonly needsHealing: NeedsHealingSignal;
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
 * (#113) can. A step whose tool call succeeds is still only trusted once its `expect`
 * post-condition (#112) also holds — a click that hits the wrong element still reports
 * "succeeded" from the tool's point of view. Stops at the first failed step; checks
 * `signal` between steps (not mid-step) so `abort()` after a step has already started
 * still lets that one finish rather than leaving it in an unknown state.
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
      return {
        kind: 'failed',
        steps: results,
        failedStepId: step.stepId,
        needsHealing: {
          stepId: step.stepId,
          reason: 'target_not_found',
          message: targeted.error.message,
        },
      };
    }

    const callResult = await registry.call(targeted.value.toolId, targeted.value.args, ctx);
    if (!callResult.ok) {
      results.push({
        stepId: step.stepId,
        toolId: step.toolId,
        succeeded: false,
        errorMessage: callResult.error.message,
      });
      return {
        kind: 'failed',
        steps: results,
        failedStepId: step.stepId,
        needsHealing: {
          stepId: step.stepId,
          reason: 'tool_call_failed',
          message: callResult.error.message,
        },
      };
    }

    if (step.expect !== undefined) {
      const checked = await evaluatePostCondition(step.expect, session);
      const failureMessage = !checked.ok
        ? checked.error.message
        : checked.value
          ? undefined
          : `Post-condition "${step.expect.type}" was not met after step "${step.stepId}"`;

      if (failureMessage !== undefined) {
        results.push({
          stepId: step.stepId,
          toolId: step.toolId,
          succeeded: false,
          errorMessage: failureMessage,
          output: callResult.value,
        });
        return {
          kind: 'failed',
          steps: results,
          failedStepId: step.stepId,
          needsHealing: {
            stepId: step.stepId,
            reason: 'post_condition_failed',
            message: failureMessage,
          },
        };
      }
    }

    results.push({
      stepId: step.stepId,
      toolId: step.toolId,
      succeeded: true,
      output: callResult.value,
    });
  }

  return { kind: 'completed', steps: results };
}

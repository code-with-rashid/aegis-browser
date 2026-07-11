import type { ToolContext, ToolRegistry } from '@aegis/actions';
import type { NavigatorService } from '@aegis/agent';
import type { CdpSession } from '@aegis/perception';
import { err, ok, type Result } from '@aegis/shared';

import type { WorkflowError } from '../errors';
import {
  executeWorkflow,
  type WorkflowRunOutcome,
  type WorkflowStepResult,
} from '../executor/execute-workflow';
import { resolveWorkflowParams } from '../params/resolve-params';
import type { Workflow, WorkflowStep } from '../schema';
import type { WorkflowStore } from '../store/workflow-store';
import { healStep } from './heal-step';

export interface RunWithHealingDeps {
  readonly registry: ToolRegistry;
  readonly ctx: ToolContext;
  readonly session: CdpSession;
  readonly navigate: NavigatorService;
}

function replaceSteps(
  outcome: WorkflowRunOutcome,
  steps: readonly WorkflowStepResult[],
): WorkflowRunOutcome {
  switch (outcome.kind) {
    case 'completed':
      return { kind: 'completed', steps };
    case 'aborted':
      return { kind: 'aborted', steps };
    case 'failed':
      return { ...outcome, steps };
  }
}

/**
 * `runWorkflow` (#111) plus one capability: when a step fails, ask the Navigator to
 * propose a fix for *that step only* (`healStep`, #113) instead of giving up outright.
 * A successful heal patches the persisted `workflow` (bumping its `version` via
 * `WorkflowStore.updateWorkflow`) before continuing with the steps after it — so a
 * one-off site change gets fixed once and the next run replays deterministically again,
 * no LLM call needed until something else breaks.
 *
 * Gives up the moment a single heal attempt doesn't succeed, returning the original
 * `failed` outcome with the workflow left untouched: #113 doesn't retry a heal, ask the
 * Navigator for alternatives, or fall back to re-planning the whole run.
 */
export async function runWorkflowWithHealing(
  workflow: Workflow,
  values: Readonly<Record<string, string>>,
  store: WorkflowStore,
  deps: RunWithHealingDeps,
  signal?: AbortSignal,
): Promise<Result<WorkflowRunOutcome, WorkflowError>> {
  const resolved = resolveWorkflowParams(workflow.steps, workflow.params, values);
  if (!resolved.ok) {
    return err(resolved.error);
  }

  let steps = resolved.value;
  let outcome = await executeWorkflow(steps, deps.registry, deps.ctx, deps.session, signal);

  while (outcome.kind === 'failed') {
    const failedOutcome = outcome;
    const failedIndex = steps.findIndex((step) => step.stepId === failedOutcome.failedStepId);
    const failedStep = failedIndex === -1 ? undefined : steps[failedIndex];
    if (failedStep === undefined) {
      return ok(failedOutcome);
    }

    const healed = await healStep(
      { workflowName: workflow.name, step: failedStep, needsHealing: failedOutcome.needsHealing },
      deps,
      signal,
    );
    if (!healed.ok) {
      return ok(failedOutcome);
    }

    const patchedSteps: WorkflowStep[] = steps.map((step, index) =>
      index === failedIndex ? healed.value.step : step,
    );
    const patched = await store.updateWorkflow(workflow.id, { steps: patchedSteps });
    if (!patched.ok) {
      return err(patched.error);
    }

    steps = patchedSteps;
    const priorResults = failedOutcome.steps.slice(0, -1);
    const remainingOutcome = await executeWorkflow(
      steps.slice(failedIndex + 1),
      deps.registry,
      deps.ctx,
      deps.session,
      signal,
    );
    outcome = replaceSteps(remainingOutcome, [
      ...priorResults,
      healed.value.result,
      ...remainingOutcome.steps,
    ]);
  }

  return ok(outcome);
}

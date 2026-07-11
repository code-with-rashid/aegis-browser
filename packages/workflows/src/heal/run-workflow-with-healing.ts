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
import type { WorkflowStepId } from '../ids';
import { resolveWorkflowParams } from '../params/resolve-params';
import type { Workflow, WorkflowStep } from '../schema';
import type { WorkflowStore } from '../store/workflow-store';
import type { HealDiff } from './heal-diff';
import type { RunMode } from './heal-gate';
import { healStep, type HealStepDeps, type PendingHeal } from './heal-step';

export interface RunWithHealingDeps {
  readonly registry: ToolRegistry;
  readonly ctx: ToolContext;
  readonly session: CdpSession;
  readonly navigate: NavigatorService;
  readonly mode: RunMode;
}

/** A gated fix never ran unattended, or its tool id fell outside the workflow's `RunPolicy` — the run stops here, workflow untouched, exactly as `#113`'s plain failures do (#114). */
export interface HardStoppedRunOutcome {
  readonly kind: 'hard_stopped';
  readonly steps: readonly WorkflowStepResult[];
  readonly stepId: WorkflowStepId;
  readonly reason: string;
  readonly diff: HealDiff;
}

/** A proposed fix touches a `state_changing` step — it hasn't run; a human must review `diff` and call `applyConfirmedHeal` (#114). */
export interface NeedsConfirmationRunOutcome {
  readonly kind: 'needs_confirmation';
  readonly steps: readonly WorkflowStepResult[];
  readonly diff: HealDiff;
  readonly pending: PendingHeal;
}

export type HealingRunOutcome =
  WorkflowRunOutcome | HardStoppedRunOutcome | NeedsConfirmationRunOutcome;

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
 * A successful, ungated fix patches the persisted `workflow` (bumping its `version` via
 * `WorkflowStore.updateWorkflow`) before continuing with the steps after it — so a
 * one-off site change gets fixed once and the next run replays deterministically again,
 * no LLM call needed until something else breaks.
 *
 * `healStep` gates a state-changing or out-of-policy fix (#114) before it ever executes:
 * `needs_confirmation` and `hard_stopped` both stop the run here, without patching the
 * workflow — a caller reviews `diff` (and, for `needs_confirmation`, calls
 * `applyConfirmedHeal` with `pending` once a human signs off).
 *
 * Gives up the moment a single heal attempt doesn't succeed, returning the original
 * `failed` outcome with the workflow left untouched: #113/#114 don't retry a heal, ask
 * the Navigator for alternatives, or fall back to re-planning the whole run.
 */
export async function runWorkflowWithHealing(
  workflow: Workflow,
  values: Readonly<Record<string, string>>,
  store: WorkflowStore,
  deps: RunWithHealingDeps,
  signal?: AbortSignal,
): Promise<Result<HealingRunOutcome, WorkflowError>> {
  const resolved = resolveWorkflowParams(workflow.steps, workflow.params, values);
  if (!resolved.ok) {
    return err(resolved.error);
  }

  let steps = resolved.value;
  let outcome: WorkflowRunOutcome = await executeWorkflow(
    steps,
    deps.registry,
    deps.ctx,
    deps.session,
    signal,
  );

  while (outcome.kind === 'failed') {
    const failedOutcome = outcome;
    const failedIndex = steps.findIndex((step) => step.stepId === failedOutcome.failedStepId);
    const failedStep = failedIndex === -1 ? undefined : steps[failedIndex];
    if (failedStep === undefined) {
      return ok(failedOutcome);
    }

    const healDeps: HealStepDeps = { ...deps, runPolicy: workflow.authorization };
    const healed = await healStep(
      { workflowName: workflow.name, step: failedStep, needsHealing: failedOutcome.needsHealing },
      healDeps,
      signal,
    );
    if (!healed.ok) {
      return ok(failedOutcome);
    }

    const priorResults = failedOutcome.steps.slice(0, -1);

    if (healed.value.kind === 'hard_stopped') {
      return ok({
        kind: 'hard_stopped',
        steps: priorResults,
        stepId: failedStep.stepId,
        reason: healed.value.reason,
        diff: healed.value.diff,
      });
    }
    if (healed.value.kind === 'needs_confirmation') {
      return ok({
        kind: 'needs_confirmation',
        steps: priorResults,
        diff: healed.value.diff,
        pending: healed.value.pending,
      });
    }

    const appliedStep = healed.value.step;
    const appliedResult = healed.value.result;
    const patchedSteps: WorkflowStep[] = steps.map((step, index) =>
      index === failedIndex ? appliedStep : step,
    );
    const patched = await store.updateWorkflow(workflow.id, { steps: patchedSteps });
    if (!patched.ok) {
      return err(patched.error);
    }

    steps = patchedSteps;
    const remainingOutcome = await executeWorkflow(
      steps.slice(failedIndex + 1),
      deps.registry,
      deps.ctx,
      deps.session,
      signal,
    );
    outcome = replaceSteps(remainingOutcome, [
      ...priorResults,
      appliedResult,
      ...remainingOutcome.steps,
    ]);
  }

  return ok(outcome);
}

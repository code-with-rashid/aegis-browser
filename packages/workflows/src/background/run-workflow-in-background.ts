import type { ToolContext, ToolRegistry } from '@aegis/actions';
import type { NavigatorService } from '@aegis/agent';
import type { CdpSession } from '@aegis/perception';
import type { Result } from '@aegis/shared';

import { executeWorkflow, type WorkflowStepResult } from '../executor/execute-workflow';
import { healStep } from '../heal/heal-step';
import { resolveWorkflowParams } from '../params/resolve-params';
import type { Workflow, WorkflowStep } from '../schema';
import type { WorkflowStore } from '../store/workflow-store';
import type { WorkflowError } from '../errors';
import type { RunRecordStatus, WorkflowRunRecord } from './run-record';
import type { WorkflowRunStore } from './run-record-store';

export interface BackgroundRunDeps {
  readonly registry: ToolRegistry;
  readonly ctx: ToolContext;
  readonly session: CdpSession;
  readonly navigate: NavigatorService;
}

async function finalizeRun(
  runStore: WorkflowRunStore,
  recordId: WorkflowRunRecord['id'],
  status: RunRecordStatus,
  stepResults: readonly WorkflowStepResult[],
  nextStepIndex: number,
  reason?: string,
): Promise<Result<WorkflowRunRecord, WorkflowError>> {
  return runStore.updateRun(recordId, {
    status,
    stepResults: [...stepResults],
    nextStepIndex,
    ...(reason !== undefined ? { reason } : {}),
  });
}

/**
 * Runs (or resumes) one workflow entirely unattended, checkpointing progress after every
 * step so a service-worker eviction never loses more than the one step in flight when it
 * died (#115's "lifecycle + persistence across service-worker eviction"). Unlike
 * `runWorkflowWithHealing` (#113/#114), which drives a whole run in one call, this steps
 * through `workflow.steps` one at a time via `executeWorkflow([step], ...)` so
 * `runRecord.nextStepIndex`/`stepResults` can be persisted after each one — a caller that
 * reloads the same (or a freshly rehydrated) `runRecord` and calls this again resumes from
 * exactly the last completed step, never re-running anything already recorded and never
 * silently skipping anything that wasn't.
 *
 * Always heals with `mode: 'unattended'` (#114): a state-changing fix hard-stops rather
 * than pausing for confirmation — there is no one to confirm it in a background run.
 */
export async function runWorkflowInBackground(
  workflow: Workflow,
  runRecord: WorkflowRunRecord,
  runStore: WorkflowRunStore,
  workflowStore: WorkflowStore,
  deps: BackgroundRunDeps,
  signal?: AbortSignal,
): Promise<Result<WorkflowRunRecord, WorkflowError>> {
  const resolved = resolveWorkflowParams(workflow.steps, workflow.params, runRecord.values);
  if (!resolved.ok) {
    return finalizeRun(
      runStore,
      runRecord.id,
      'failed',
      runRecord.stepResults as WorkflowStepResult[],
      runRecord.nextStepIndex,
      resolved.error.message,
    );
  }

  let steps = resolved.value;
  let stepResults = runRecord.stepResults as WorkflowStepResult[];
  let index = runRecord.nextStepIndex;

  while (index < steps.length) {
    if (signal?.aborted === true) {
      return finalizeRun(runStore, runRecord.id, 'aborted', stepResults, index);
    }

    const step = steps[index];
    if (step === undefined) {
      return finalizeRun(runStore, runRecord.id, 'completed', stepResults, index);
    }

    const stepOutcome = await executeWorkflow(
      [step],
      deps.registry,
      deps.ctx,
      deps.session,
      signal,
    );

    if (stepOutcome.kind === 'aborted') {
      return finalizeRun(runStore, runRecord.id, 'aborted', stepResults, index);
    }

    if (stepOutcome.kind === 'completed') {
      stepResults = [...stepResults, ...stepOutcome.steps];
      index += 1;
      const persisted = await runStore.updateRun(runRecord.id, {
        stepResults,
        nextStepIndex: index,
      });
      if (!persisted.ok) {
        return persisted;
      }
      continue;
    }

    const healed = await healStep(
      { workflowName: workflow.name, step, needsHealing: stepOutcome.needsHealing },
      { ...deps, runPolicy: workflow.authorization, mode: 'unattended' },
      signal,
    );
    if (!healed.ok) {
      return finalizeRun(
        runStore,
        runRecord.id,
        'failed',
        stepResults,
        index,
        stepOutcome.needsHealing.message,
      );
    }

    switch (healed.value.kind) {
      case 'hard_stopped':
        return finalizeRun(
          runStore,
          runRecord.id,
          'hard_stopped',
          stepResults,
          index,
          healed.value.reason,
        );
      case 'needs_confirmation':
        // `gateHeal` never actually returns this for `mode: 'unattended'` — handled
        // defensively so this switch stays exhaustive against `HealOutcome`.
        return finalizeRun(
          runStore,
          runRecord.id,
          'needs_confirmation',
          stepResults,
          index,
          'A healed fix unexpectedly required confirmation during an unattended run',
        );
      case 'applied': {
        const appliedStep = healed.value.step;
        const appliedResult = healed.value.result;
        const patchedSteps: WorkflowStep[] = steps.map((s, i) => (i === index ? appliedStep : s));
        const patched = await workflowStore.updateWorkflow(workflow.id, { steps: patchedSteps });
        if (!patched.ok) {
          return finalizeRun(
            runStore,
            runRecord.id,
            'failed',
            stepResults,
            index,
            patched.error.message,
          );
        }
        steps = patchedSteps;
        stepResults = [...stepResults, appliedResult];
        index += 1;
        const persisted = await runStore.updateRun(runRecord.id, {
          stepResults,
          nextStepIndex: index,
        });
        if (!persisted.ok) {
          return persisted;
        }
      }
    }
  }

  return finalizeRun(runStore, runRecord.id, 'completed', stepResults, index);
}

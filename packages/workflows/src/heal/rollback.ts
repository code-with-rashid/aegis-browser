import { err, type Result } from '@aegis/shared';

import { WorkflowError } from '../errors';
import type { WorkflowId, WorkflowStepId } from '../ids';
import type { Workflow, WorkflowStep } from '../schema';
import type { WorkflowStore } from '../store/workflow-store';

/**
 * Reverts one step back to `previousStep` — the undo half of a heal that was already
 * patched into the store (`HealDiff.before`, from `heal-diff.ts`, is exactly what a
 * caller passes back in here). A thin, named wrapper over `WorkflowStore.updateWorkflow`
 * rather than an implementation detail every caller reconstructs (fetch the workflow,
 * splice the one step, patch): "roll back a heal" is a first-class operation #114's
 * acceptance criteria calls for. Still bumps `version`/`updatedAt` like any other patch —
 * a rollback is itself a real edit, not a time-travel back to the exact prior version.
 */
export async function rollbackHealedStep(
  store: WorkflowStore,
  workflowId: WorkflowId,
  stepId: WorkflowStepId,
  previousStep: WorkflowStep,
): Promise<Result<Workflow, WorkflowError>> {
  const current = await store.getWorkflow(workflowId);
  if (!current.ok) {
    return current;
  }
  if (current.value === undefined) {
    return err(new WorkflowError('WORKFLOW_NOT_FOUND', `Workflow "${workflowId}" does not exist`));
  }

  const steps = current.value.steps.map((step) => (step.stepId === stepId ? previousStep : step));
  return store.updateWorkflow(workflowId, { steps });
}

import type { ActionRisk } from '@aegis/actions';

import type { WorkflowStep, WorkflowTarget } from '../schema';

/** The parts of a step that can actually change when it's healed. */
export interface HealStepSnapshot {
  readonly toolId: string;
  readonly args: unknown;
  readonly target?: WorkflowTarget;
}

/** What a proposed heal would change, and how risky the change is — the "show a diff" half of #114. */
export interface HealDiff {
  readonly stepId: WorkflowStep['stepId'];
  readonly risk: ActionRisk;
  readonly before: HealStepSnapshot;
  readonly after: HealStepSnapshot;
}

function snapshotOf(step: WorkflowStep): HealStepSnapshot {
  return {
    toolId: step.toolId,
    args: step.args,
    ...(step.target !== undefined ? { target: step.target } : {}),
  };
}

/** Builds the before/after a human (or an unattended hard-stop notice) needs to see for a proposed heal. */
export function buildHealDiff(
  original: WorkflowStep,
  healed: WorkflowStep,
  risk: ActionRisk,
): HealDiff {
  return {
    stepId: original.stepId,
    risk,
    before: snapshotOf(original),
    after: snapshotOf(healed),
  };
}

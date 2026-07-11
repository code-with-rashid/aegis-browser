import type { CdpSession } from '@aegis/perception';

import { toWorkflowStepId } from '../ids';
import type { WorkflowStep } from '../schema';
import { buildWorkflowSteps, type RecordableStepInput } from './build-workflow-steps';

/**
 * Accumulates `WorkflowStep`s across a whole agent run — one `recordCycle` call per
 * completed `acting` cycle (the same "`verifying` exits" hook `apps/extension`'s
 * `run-manager.ts` already uses to build the trace, #26), producing the full recorded
 * step list once the run reaches `done`. Owns the step-id counter so ids stay unique
 * across the *entire* recording, not just within one cycle's handful of tool calls.
 */
export interface RunRecorder {
  recordCycle(input: RecordableStepInput): Promise<void>;
  /** Every step recorded so far, in execution order. */
  readonly steps: readonly WorkflowStep[];
}

export function createRunRecorder(session: CdpSession): RunRecorder {
  const steps: WorkflowStep[] = [];
  let stepCounter = 0;

  return {
    async recordCycle(input) {
      const newSteps = await buildWorkflowSteps(input, session, () => {
        stepCounter += 1;
        return toWorkflowStepId(`step-${stepCounter}`);
      });
      steps.push(...newSteps);
    },

    get steps() {
      return steps;
    },
  };
}

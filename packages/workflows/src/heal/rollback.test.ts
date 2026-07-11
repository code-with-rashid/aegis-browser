import { createMemoryStorage } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { toWorkflowId, toWorkflowStepId } from '../ids';
import type { NewWorkflowInput } from '../store/workflow-store';
import { createWorkflowStore } from '../store/workflow-store';
import { rollbackHealedStep } from './rollback';

function workflowInput(): NewWorkflowInput {
  return {
    id: toWorkflowId('check-order-status'),
    name: 'Check order status',
    origin: 'https://shop.example.com',
    steps: [
      {
        stepId: toWorkflowStepId('step-1'),
        toolId: 'browser.click',
        args: { type: 'click', ref: 'dom:99' },
        target: { ref: 'dom:99', selector: '#old-button' },
      },
    ],
    authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false },
  };
}

describe('rollbackHealedStep', () => {
  it('reverts a healed step back to its prior definition, bumping version', async () => {
    const store = createWorkflowStore(createMemoryStorage());
    const created = await store.createWorkflow(workflowInput());
    expect(created.ok).toBe(true);
    const originalStep = created.ok ? created.value.steps[0] : undefined;
    if (originalStep === undefined) {
      throw new Error('expected an original step');
    }

    await store.updateWorkflow(toWorkflowId('check-order-status'), {
      steps: [
        {
          stepId: toWorkflowStepId('step-1'),
          toolId: 'browser.click',
          args: { type: 'click', ref: 'el:42' },
          target: { ref: 'el:42', selector: '#new-button' },
        },
      ],
    });

    const rolledBack = await rollbackHealedStep(
      store,
      toWorkflowId('check-order-status'),
      toWorkflowStepId('step-1'),
      originalStep,
    );

    expect(rolledBack.ok).toBe(true);
    expect(rolledBack.ok && rolledBack.value.version).toBe(2);
    expect(rolledBack.ok && rolledBack.value.steps[0]).toEqual(originalStep);

    const stored = await store.getWorkflow(toWorkflowId('check-order-status'));
    expect(stored.ok && stored.value?.steps[0]).toEqual(originalStep);
  });

  it('only reverts the named step, leaving other steps untouched', async () => {
    const store = createWorkflowStore(createMemoryStorage());
    const originalStep = {
      stepId: toWorkflowStepId('step-1'),
      toolId: 'browser.click',
      args: { type: 'click', ref: 'dom:99' },
      target: { ref: 'dom:99', selector: '#old-button' },
    };
    const secondStep = {
      stepId: toWorkflowStepId('step-2'),
      toolId: 'browser.wait',
      args: { type: 'wait', ms: 1 },
    };
    const withSecondStep: NewWorkflowInput = {
      ...workflowInput(),
      steps: [originalStep, secondStep],
    };
    await store.createWorkflow(withSecondStep);

    await store.updateWorkflow(toWorkflowId('check-order-status'), {
      steps: [
        {
          stepId: toWorkflowStepId('step-1'),
          toolId: 'browser.click',
          args: { type: 'click', ref: 'el:42' },
        },
        {
          stepId: toWorkflowStepId('step-2'),
          toolId: 'browser.wait',
          args: { type: 'wait', ms: 1 },
        },
      ],
    });

    const rolledBack = await rollbackHealedStep(
      store,
      toWorkflowId('check-order-status'),
      toWorkflowStepId('step-1'),
      originalStep,
    );

    expect(rolledBack.ok).toBe(true);
    expect(rolledBack.ok && rolledBack.value.steps[0]).toEqual(originalStep);
    expect(rolledBack.ok && rolledBack.value.steps[1]).toEqual(withSecondStep.steps[1]);
  });

  it('fails with WORKFLOW_NOT_FOUND when the workflow does not exist', async () => {
    const store = createWorkflowStore(createMemoryStorage());

    const result = await rollbackHealedStep(
      store,
      toWorkflowId('does-not-exist'),
      toWorkflowStepId('step-1'),
      {
        stepId: toWorkflowStepId('step-1'),
        toolId: 'browser.click',
        args: { type: 'click', ref: 'dom:1' },
      },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('WORKFLOW_NOT_FOUND');
  });
});

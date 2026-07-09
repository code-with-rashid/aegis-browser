import type { PerceptionPayload } from '@aegis/perception';
import { toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import type { AgentLoopContext } from './machine';
import { buildTraceStep } from './trace';

function perceptionFixture(): PerceptionPayload {
  return {
    elements: [
      { ref: toElementRef('ax:1'), role: 'button', name: 'Submit Order', state: {}, source: 'ax' },
    ],
    content: { text: 'Checkout page', truncated: false },
    tokenEstimate: 10,
    truncated: false,
  };
}

function contextFixture(overrides: Partial<AgentLoopContext> = {}): AgentLoopContext {
  return {
    task: 'Buy oat milk',
    tabId: 1,
    maxSteps: 40,
    maxReplans: 8,
    stepCount: 1,
    replanCount: 0,
    subGoal: 'Add to cart',
    subGoalHistory: ['Add to cart'],
    perception: perceptionFixture(),
    proposedActions: [{ type: 'click', ref: toElementRef('ax:1') }],
    lastRunSummary: { kind: 'completed', actions: [{ type: 'click', succeeded: true }] },
    lastError: undefined,
    taskSummary: undefined,
    pendingConfirmation: undefined,
    policyCheckReason: undefined,
    plannerReasoning: 'user wants oat milk',
    navigatorReasoning: 'clicking add to cart',
    verifierReasoning: 'cart now shows the item',
    verifyOutcome: 'achieved',
    ...overrides,
  };
}

describe('buildTraceStep', () => {
  it('returns undefined when no action has run yet', () => {
    expect(buildTraceStep(contextFixture({ lastRunSummary: undefined }), 1)).toBeUndefined();
  });

  it('builds a step with the sub-goal, reasoning, and verify outcome', () => {
    const step = buildTraceStep(contextFixture(), 3);

    expect(step).toEqual({
      stepNumber: 3,
      subGoal: 'Add to cart',
      plannerReasoning: 'user wants oat milk',
      navigatorReasoning: 'clicking add to cart',
      actions: [{ description: 'Click "Submit Order"', succeeded: true, errorMessage: undefined }],
      verifyOutcome: 'achieved',
      verifierReasoning: 'cart now shows the item',
      perception: perceptionFixture(),
    });
  });

  it('falls back to the task when no sub-goal is set', () => {
    const step = buildTraceStep(contextFixture({ subGoal: undefined }), 1);
    expect(step?.subGoal).toBe('Buy oat milk');
  });

  it('describes a failed action with its error message', () => {
    const step = buildTraceStep(
      contextFixture({
        lastRunSummary: {
          kind: 'failed',
          actions: [
            {
              type: 'click',
              succeeded: false,
              errorCode: 'ELEMENT_DETACHED',
              errorMessage: 'no longer attached',
            },
          ],
        },
      }),
      1,
    );

    expect(step?.actions).toEqual([
      { description: 'Click "Submit Order"', succeeded: false, errorMessage: 'no longer attached' },
    ]);
  });

  it('falls back to the raw action type when there is no matching proposed action', () => {
    const step = buildTraceStep(contextFixture({ proposedActions: [] }), 1);
    expect(step?.actions).toEqual([
      { description: 'click', succeeded: true, errorMessage: undefined },
    ]);
  });

  it('carries multiple actions in order', () => {
    const step = buildTraceStep(
      contextFixture({
        proposedActions: [{ type: 'click', ref: toElementRef('ax:1') }, { type: 'go_back' }],
        lastRunSummary: {
          kind: 'completed',
          actions: [
            { type: 'click', succeeded: true },
            { type: 'go_back', succeeded: true },
          ],
        },
      }),
      1,
    );

    expect(step?.actions).toEqual([
      { description: 'Click "Submit Order"', succeeded: true, errorMessage: undefined },
      { description: 'Go back', succeeded: true, errorMessage: undefined },
    ]);
  });
});

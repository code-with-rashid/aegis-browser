import { describe, expect, it } from 'vitest';

import type { AgentLoopContext } from './machine';
import { summarizeLoopRun } from './summary';

function contextFixture(overrides: Partial<AgentLoopContext> = {}): AgentLoopContext {
  return {
    task: 'Buy oat milk',
    tabId: 1,
    maxSteps: 40,
    maxReplans: 8,
    stepCount: 3,
    replanCount: 1,
    subGoal: undefined,
    subGoalHistory: ['search for oat milk', 'add to cart'],
    perception: undefined,
    proposedActions: [],
    lastRunSummary: undefined,
    lastError: undefined,
    taskSummary: undefined,
    pendingConfirmation: undefined,
    ...overrides,
  };
}

describe('summarizeLoopRun', () => {
  it('reports "done" with the task summary', () => {
    const summary = summarizeLoopRun({
      value: 'done',
      context: contextFixture({ taskSummary: 'Oat milk purchased' }),
    });

    expect(summary).toEqual({
      outcome: 'done',
      task: 'Buy oat milk',
      stepCount: 3,
      replanCount: 1,
      subGoalHistory: ['search for oat milk', 'add to cart'],
      taskSummary: 'Oat milk purchased',
    });
  });

  it('reports "failed" with the last error', () => {
    const summary = summarizeLoopRun({
      value: 'failed',
      context: contextFixture({
        lastError: { code: 'MAX_STEPS_EXCEEDED', message: 'too many steps' },
      }),
    });

    expect(summary.outcome).toBe('failed');
    expect(summary.lastError).toEqual({ code: 'MAX_STEPS_EXCEEDED', message: 'too many steps' });
  });

  it('reports "stopped"', () => {
    const summary = summarizeLoopRun({ value: 'stopped', context: contextFixture() });
    expect(summary.outcome).toBe('stopped');
  });

  it('reports "active" for any non-terminal state value', () => {
    const summary = summarizeLoopRun({ value: 'perceiving', context: contextFixture() });
    expect(summary.outcome).toBe('active');
  });

  it('omits taskSummary/lastError when neither is set', () => {
    const summary = summarizeLoopRun({ value: 'stopped', context: contextFixture() });
    expect(summary.taskSummary).toBeUndefined();
    expect(summary.lastError).toBeUndefined();
    expect('taskSummary' in summary).toBe(false);
    expect('lastError' in summary).toBe(false);
  });
});

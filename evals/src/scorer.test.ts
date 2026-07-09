import { describe, expect, it } from 'vitest';

import { buildReport, scoreTask, type TaskRunResult } from './scorer';

function resultFixture(overrides: Partial<TaskRunResult> = {}): TaskRunResult {
  return {
    taskId: 'research-and-extract',
    outcome: 'done',
    summaryMatched: true,
    stepCount: 2,
    replanCount: 0,
    durationMs: 1000,
    ...overrides,
  };
}

describe('scoreTask', () => {
  it('passes when the outcome is done and the summary matched', () => {
    expect(scoreTask(resultFixture()).passed).toBe(true);
  });

  it('fails when the outcome is done but the summary did not match', () => {
    expect(scoreTask(resultFixture({ summaryMatched: false })).passed).toBe(false);
  });

  it('fails when the outcome is not done, even with a matching summary', () => {
    expect(scoreTask(resultFixture({ outcome: 'failed' })).passed).toBe(false);
  });

  it('fails on a timeout', () => {
    expect(scoreTask(resultFixture({ outcome: 'timeout', summaryMatched: false })).passed).toBe(
      false,
    );
  });
});

describe('buildReport', () => {
  it('counts passed and total across mixed results', () => {
    const report = buildReport(1, [
      resultFixture({ taskId: 'a' }),
      resultFixture({ taskId: 'b', outcome: 'failed' }),
      resultFixture({ taskId: 'c' }),
    ]);

    expect(report.version).toBe(1);
    expect(report.totalCount).toBe(3);
    expect(report.passedCount).toBe(2);
    expect(report.scores.map((s) => s.taskId)).toEqual(['a', 'b', 'c']);
  });

  it('reports 0/0 for an empty task list', () => {
    const report = buildReport(1, []);
    expect(report.passedCount).toBe(0);
    expect(report.totalCount).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';

import { buildReport } from './scorer';
import { formatReport } from './report';
import type { TaskRunResult } from './scorer';

function resultFixture(overrides: Partial<TaskRunResult> = {}): TaskRunResult {
  return {
    taskId: 'research-and-extract',
    outcome: 'done',
    summaryMatched: true,
    stepCount: 2,
    replanCount: 0,
    durationMs: 1234,
    ...overrides,
  };
}

describe('formatReport', () => {
  it('marks a passing task PASS with its detail', () => {
    const report = buildReport(1, [resultFixture()]);
    const text = formatReport(report);

    expect(text).toContain('task set v1');
    expect(text).toContain('[PASS] research-and-extract');
    expect(text).toContain('outcome=done');
    expect(text).toContain('steps=2');
    expect(text).toContain('replans=0');
    expect(text).toContain('duration=1234ms');
    expect(text).toContain('1/1 tasks passed');
  });

  it('marks a failing task FAIL and includes the error when present', () => {
    const report = buildReport(1, [
      resultFixture({ outcome: 'failed', summaryMatched: false, error: 'boom' }),
    ]);
    const text = formatReport(report);

    expect(text).toContain('[FAIL] research-and-extract');
    expect(text).toContain('error=boom');
    expect(text).toContain('0/1 tasks passed');
  });
});

import type { RunPolicy, Workflow } from '../schema';
import { describe, expect, it } from 'vitest';

import { exceedsMaxSteps, hasReachedDailyRunLimit } from './run-rate-limit';

function policy(overrides: Partial<RunPolicy> = {}): RunPolicy {
  return { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false, ...overrides };
}

const ONE_DAY_MS = 24 * 60 * 60_000;

describe('hasReachedDailyRunLimit', () => {
  it('never limits when maxRunsPerDay is not configured', () => {
    const now = Date.now();
    expect(hasReachedDailyRunLimit(policy(), [now, now, now], now)).toBe(false);
  });

  it('is not reached when fewer runs than the cap started in the last 24h', () => {
    const now = Date.now();
    const result = hasReachedDailyRunLimit(policy({ maxRunsPerDay: 3 }), [now, now], now);
    expect(result).toBe(false);
  });

  it('is reached once the cap of runs started in the last 24h', () => {
    const now = Date.now();
    const result = hasReachedDailyRunLimit(policy({ maxRunsPerDay: 2 }), [now, now], now);
    expect(result).toBe(true);
  });

  it('ignores runs that started more than 24h ago', () => {
    const now = Date.now();
    const longAgo = now - ONE_DAY_MS - 60_000;
    const result = hasReachedDailyRunLimit(policy({ maxRunsPerDay: 1 }), [longAgo, longAgo], now);
    expect(result).toBe(false);
  });
});

describe('exceedsMaxSteps', () => {
  function workflow(stepCount: number): Pick<Workflow, 'steps'> {
    return { steps: Array.from({ length: stepCount }, () => ({}) as Workflow['steps'][number]) };
  }

  it('never limits when maxStepsPerRun is not configured', () => {
    expect(exceedsMaxSteps(workflow(100), policy())).toBe(false);
  });

  it('does not exceed when the workflow has fewer steps than the cap', () => {
    expect(exceedsMaxSteps(workflow(3), policy({ maxStepsPerRun: 5 }))).toBe(false);
  });

  it('exceeds when the workflow has more steps than the cap', () => {
    expect(exceedsMaxSteps(workflow(6), policy({ maxStepsPerRun: 5 }))).toBe(true);
  });
});

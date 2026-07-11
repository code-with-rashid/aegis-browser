import { describe, expect, it } from 'vitest';

import { toWorkflowId } from '../ids';
import { findDueSchedules, isScheduleDue } from './due-schedules';
import type { WorkflowSchedule } from './workflow-schedule';

function schedule(overrides: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    workflowId: toWorkflowId('wf-1'),
    enabled: true,
    trigger: { kind: 'interval', everyMinutes: 60 },
    values: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const HOUR_MS = 60 * 60_000;

describe('isScheduleDue', () => {
  it('is never due when disabled, regardless of trigger', () => {
    const now = Date.parse('2026-07-11T12:00:00Z');
    expect(isScheduleDue(schedule({ enabled: false }), now)).toBe(false);
  });

  describe('interval trigger', () => {
    it('is due immediately when it has never run', () => {
      const now = Date.parse('2026-07-11T12:00:00Z');
      expect(isScheduleDue(schedule({ lastRunAt: undefined }), now)).toBe(true);
    });

    it('is not due before the interval has elapsed', () => {
      const now = Date.parse('2026-07-11T12:00:00Z');
      const lastRunAt = now - 30 * 60_000; // 30 minutes ago, interval is 60
      expect(isScheduleDue(schedule({ lastRunAt }), now)).toBe(false);
    });

    it('is due once the interval has elapsed', () => {
      const now = Date.parse('2026-07-11T12:00:00Z');
      const lastRunAt = now - HOUR_MS;
      expect(isScheduleDue(schedule({ lastRunAt }), now)).toBe(true);
    });
  });

  describe('daily trigger', () => {
    function dailySchedule(overrides: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
      return schedule({ trigger: { kind: 'daily', hour: 9, minute: 0 }, ...overrides });
    }

    it('is due when it has never run and the scheduled time today has passed', () => {
      const now = Date.parse('2026-07-11T10:00:00');
      expect(isScheduleDue(dailySchedule(), now)).toBe(true);
    });

    it("is not due before today's scheduled time has arrived yet", () => {
      const now = Date.parse('2026-07-11T08:00:00');
      expect(isScheduleDue(dailySchedule(), now)).toBe(false);
    });

    it("is not due again if it already ran since today's occurrence", () => {
      const now = Date.parse('2026-07-11T10:00:00');
      const lastRunAt = Date.parse('2026-07-11T09:00:01');
      expect(isScheduleDue(dailySchedule({ lastRunAt }), now)).toBe(false);
    });

    it('is due again the next day even if it ran yesterday', () => {
      const now = Date.parse('2026-07-12T09:30:00');
      const lastRunAt = Date.parse('2026-07-11T09:00:01');
      expect(isScheduleDue(dailySchedule({ lastRunAt }), now)).toBe(true);
    });
  });
});

describe('findDueSchedules', () => {
  it('returns only the schedules that are due', () => {
    const now = Date.parse('2026-07-11T12:00:00Z');
    const due = schedule({ workflowId: toWorkflowId('due'), lastRunAt: now - HOUR_MS });
    const notDue = schedule({ workflowId: toWorkflowId('not-due'), lastRunAt: now });
    const disabled = schedule({ workflowId: toWorkflowId('disabled'), enabled: false });

    const result = findDueSchedules([due, notDue, disabled], now);

    expect(result.map((s) => s.workflowId)).toEqual(['due']);
  });
});

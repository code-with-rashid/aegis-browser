import { createMemoryStorage } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { toWorkflowId } from '../ids';
import { createWorkflowScheduleStore, type UpsertScheduleInput } from './workflow-schedule-store';

function scheduleInput(overrides: Partial<UpsertScheduleInput> = {}): UpsertScheduleInput {
  return {
    workflowId: toWorkflowId('check-order-status'),
    enabled: true,
    trigger: { kind: 'interval', everyMinutes: 60 },
    ...overrides,
  };
}

describe('createWorkflowScheduleStore', () => {
  describe('getSchedule', () => {
    it('returns undefined when no schedule exists for a workflow', async () => {
      const store = createWorkflowScheduleStore(createMemoryStorage());
      const result = await store.getSchedule(toWorkflowId('missing'));
      expect(result.ok && result.value).toBeUndefined();
    });
  });

  describe('upsertSchedule', () => {
    it('creates a schedule with default empty values and matching createdAt/updatedAt', async () => {
      const store = createWorkflowScheduleStore(createMemoryStorage());

      const result = await store.upsertSchedule(scheduleInput());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.enabled).toBe(true);
        expect(result.value.values).toEqual({});
        expect(result.value.createdAt).toBe(result.value.updatedAt);
        expect(result.value.lastRunAt).toBeUndefined();
      }
    });

    it('replaces an existing schedule for the same workflow, preserving the original createdAt', async () => {
      const store = createWorkflowScheduleStore(createMemoryStorage());
      const first = await store.upsertSchedule(scheduleInput());
      expect(first.ok).toBe(true);

      const second = await store.upsertSchedule(
        scheduleInput({ trigger: { kind: 'daily', hour: 9, minute: 0 } }),
      );

      expect(second.ok).toBe(true);
      if (second.ok && first.ok) {
        expect(second.value.trigger).toEqual({ kind: 'daily', hour: 9, minute: 0 });
        expect(second.value.createdAt).toBe(first.value.createdAt);
      }
    });
  });

  describe('updateSchedule', () => {
    it('patches enabled/lastRunAt and bumps updatedAt', async () => {
      const store = createWorkflowScheduleStore(createMemoryStorage());
      await store.upsertSchedule(scheduleInput());

      const result = await store.updateSchedule(toWorkflowId('check-order-status'), {
        enabled: false,
        lastRunAt: 12345,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.enabled).toBe(false);
        expect(result.value.lastRunAt).toBe(12345);
      }
    });

    it('fails with WORKFLOW_NOT_FOUND when no schedule exists yet', async () => {
      const store = createWorkflowScheduleStore(createMemoryStorage());

      const result = await store.updateSchedule(toWorkflowId('missing'), { enabled: false });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('WORKFLOW_NOT_FOUND');
    });
  });

  describe('removeSchedule', () => {
    it('removes an existing schedule', async () => {
      const store = createWorkflowScheduleStore(createMemoryStorage());
      await store.upsertSchedule(scheduleInput());

      await store.removeSchedule(toWorkflowId('check-order-status'));

      const result = await store.getSchedule(toWorkflowId('check-order-status'));
      expect(result.ok && result.value).toBeUndefined();
    });

    it('succeeds as a no-op when nothing exists to remove', async () => {
      const store = createWorkflowScheduleStore(createMemoryStorage());
      const result = await store.removeSchedule(toWorkflowId('missing'));
      expect(result.ok).toBe(true);
    });
  });

  describe('listSchedules', () => {
    it('lists every schedule', async () => {
      const store = createWorkflowScheduleStore(createMemoryStorage());
      await store.upsertSchedule(scheduleInput({ workflowId: toWorkflowId('wf-1') }));
      await store.upsertSchedule(scheduleInput({ workflowId: toWorkflowId('wf-2') }));

      const result = await store.listSchedules();

      expect(result.ok && result.value).toHaveLength(2);
    });
  });
});

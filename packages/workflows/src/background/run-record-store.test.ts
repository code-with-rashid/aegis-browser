import { createMemoryStorage } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { toRunRecordId, toWorkflowId } from '../ids';
import { createWorkflowRunStore, type NewRunRecordInput } from './run-record-store';

function newRunInput(overrides: Partial<NewRunRecordInput> = {}): NewRunRecordInput {
  return {
    id: toRunRecordId('run-1'),
    workflowId: toWorkflowId('wf-1'),
    values: { search_term: 'oat milk' },
    ...overrides,
  };
}

describe('createWorkflowRunStore', () => {
  describe('getRun', () => {
    it('returns undefined for a run that was never created', async () => {
      const store = createWorkflowRunStore(createMemoryStorage());
      const result = await store.getRun(toRunRecordId('missing'));
      expect(result.ok && result.value).toBeUndefined();
    });
  });

  describe('createRun', () => {
    it('creates a run starting at status running, step 0, with no results yet', async () => {
      const store = createWorkflowRunStore(createMemoryStorage());

      const result = await store.createRun(newRunInput());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('running');
        expect(result.value.nextStepIndex).toBe(0);
        expect(result.value.stepResults).toEqual([]);
        expect(result.value.values).toEqual({ search_term: 'oat milk' });
        expect(result.value.startedAt).toBe(result.value.updatedAt);
      }
    });

    it('persists the run so a later getRun finds it', async () => {
      const store = createWorkflowRunStore(createMemoryStorage());
      await store.createRun(newRunInput());

      const result = await store.getRun(toRunRecordId('run-1'));

      expect(result.ok && result.value?.workflowId).toBe('wf-1');
    });
  });

  describe('updateRun', () => {
    it('patches status/nextStepIndex/stepResults and bumps updatedAt', async () => {
      const store = createWorkflowRunStore(createMemoryStorage());
      const created = await store.createRun(newRunInput());
      expect(created.ok).toBe(true);

      const result = await store.updateRun(toRunRecordId('run-1'), {
        status: 'completed',
        nextStepIndex: 2,
        stepResults: [{ stepId: 'step-1', toolId: 'browser.click', succeeded: true }],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('completed');
        expect(result.value.nextStepIndex).toBe(2);
        expect(result.value.stepResults).toHaveLength(1);
      }
    });

    it('fails with RUN_RECORD_NOT_FOUND for a run that does not exist', async () => {
      const store = createWorkflowRunStore(createMemoryStorage());

      const result = await store.updateRun(toRunRecordId('missing'), { status: 'failed' });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('RUN_RECORD_NOT_FOUND');
    });
  });

  describe('listRuns / listRunningRuns', () => {
    it('lists every created run', async () => {
      const store = createWorkflowRunStore(createMemoryStorage());
      await store.createRun(newRunInput({ id: toRunRecordId('run-1') }));
      await store.createRun(newRunInput({ id: toRunRecordId('run-2') }));

      const result = await store.listRuns();

      expect(result.ok && result.value).toHaveLength(2);
    });

    it('lists only runs still in status running', async () => {
      const store = createWorkflowRunStore(createMemoryStorage());
      await store.createRun(newRunInput({ id: toRunRecordId('run-1') }));
      await store.createRun(newRunInput({ id: toRunRecordId('run-2') }));
      await store.updateRun(toRunRecordId('run-2'), { status: 'completed' });

      const result = await store.listRunningRuns();

      expect(result.ok && result.value.map((record) => record.id)).toEqual(['run-1']);
    });
  });
});

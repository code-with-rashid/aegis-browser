import { createMemoryStorage } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { toWorkflowId, toWorkflowStepId } from '../ids';
import type { RunPolicy, WorkflowStep } from '../schema';
import { WorkflowEnvelopeMapSchema } from './workflow-envelope';
import { createWorkflowStore, type NewWorkflowInput } from './workflow-store';

/** Matches `workflow-store.ts`'s own private storage key — duplicated here deliberately, so this test seeds storage exactly the way the store itself would have written it. */
const WORKFLOWS_KEY = 'workflows';

function policy(overrides: Partial<RunPolicy> = {}): RunPolicy {
  return {
    allowedToolIds: [],
    allowedOrigins: [],
    allowStateChanging: false,
    ...overrides,
  };
}

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    stepId: toWorkflowStepId('step-1'),
    toolId: 'browser.click',
    args: { type: 'click', ref: 'ax:1' },
    ...overrides,
  };
}

function newWorkflowInput(overrides: Partial<NewWorkflowInput> = {}): NewWorkflowInput {
  return {
    id: toWorkflowId('wf-1'),
    name: 'Check order status',
    origin: 'https://example.com',
    steps: [step()],
    authorization: policy(),
    ...overrides,
  };
}

describe('createWorkflowStore', () => {
  describe('getWorkflow', () => {
    it('returns undefined for a workflow that was never created', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const result = await store.getWorkflow(toWorkflowId('missing'));
      expect(result.ok && result.value).toBeUndefined();
    });
  });

  describe('createWorkflow', () => {
    it('creates a workflow at version 0 with matching createdAt/updatedAt', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const result = await store.createWorkflow(newWorkflowInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.version).toBe(0);
      expect(result.value.createdAt).toBe(result.value.updatedAt);
      expect(result.value.name).toBe('Check order status');
      expect(result.value.params).toEqual([]);
    });

    it('round-trips a created workflow through getWorkflow', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const created = await store.createWorkflow(newWorkflowInput());
      if (!created.ok) throw new Error('expected create to succeed');

      const fetched = await store.getWorkflow(created.value.id);

      expect(fetched.ok && fetched.value).toEqual(created.value);
    });

    it('fails with WORKFLOW_ALREADY_EXISTS when the id is already in use', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      await store.createWorkflow(newWorkflowInput());

      const result = await store.createWorkflow(newWorkflowInput());

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('WORKFLOW_ALREADY_EXISTS');
    });

    it('defaults params to an empty array when omitted', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const result = await store.createWorkflow(newWorkflowInput());
      expect(result.ok && result.value.params).toEqual([]);
    });
  });

  describe('updateWorkflow', () => {
    it('applies a patch, bumping version and updatedAt', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const created = await store.createWorkflow(newWorkflowInput());
      if (!created.ok) throw new Error('expected create to succeed');

      const result = await store.updateWorkflow(created.value.id, { name: 'Renamed workflow' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBe('Renamed workflow');
      expect(result.value.version).toBe(1);
      expect(result.value.createdAt).toBe(created.value.createdAt);
      expect(result.value.updatedAt).toBeGreaterThanOrEqual(created.value.createdAt);
    });

    it('leaves unpatched fields untouched', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const created = await store.createWorkflow(newWorkflowInput());
      if (!created.ok) throw new Error('expected create to succeed');

      const result = await store.updateWorkflow(created.value.id, { name: 'New name' });

      expect(result.ok && result.value.origin).toBe('https://example.com');
      expect(result.ok && result.value.steps).toEqual(created.value.steps);
    });

    it('fails with WORKFLOW_NOT_FOUND for a workflow that does not exist', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const result = await store.updateWorkflow(toWorkflowId('missing'), { name: 'x' });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('WORKFLOW_NOT_FOUND');
    });

    it('bumps version again on a second update', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const created = await store.createWorkflow(newWorkflowInput());
      if (!created.ok) throw new Error('expected create to succeed');

      await store.updateWorkflow(created.value.id, { name: 'first' });
      const second = await store.updateWorkflow(created.value.id, { name: 'second' });

      expect(second.ok && second.value.version).toBe(2);
    });
  });

  describe('removeWorkflow', () => {
    it('removes an existing workflow', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const created = await store.createWorkflow(newWorkflowInput());
      if (!created.ok) throw new Error('expected create to succeed');

      await store.removeWorkflow(created.value.id);
      const result = await store.getWorkflow(created.value.id);

      expect(result.ok && result.value).toBeUndefined();
    });

    it('is a no-op (still succeeds) for a workflow that was never created', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const result = await store.removeWorkflow(toWorkflowId('missing'));
      expect(result.ok).toBe(true);
    });
  });

  describe('listWorkflows', () => {
    it('returns an empty list when nothing has been created', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const result = await store.listWorkflows();
      expect(result.ok && result.value).toEqual([]);
    });

    it('lists every created workflow', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      await store.createWorkflow(newWorkflowInput({ id: toWorkflowId('wf-a'), name: 'A' }));
      await store.createWorkflow(newWorkflowInput({ id: toWorkflowId('wf-b'), name: 'B' }));

      const result = await store.listWorkflows();

      expect(result.ok && result.value.map((workflow) => workflow.name).sort()).toEqual(['A', 'B']);
    });

    it('does not list a removed workflow', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const created = await store.createWorkflow(newWorkflowInput());
      if (!created.ok) throw new Error('expected create to succeed');
      await store.removeWorkflow(created.value.id);

      const result = await store.listWorkflows();

      expect(result.ok && result.value).toEqual([]);
    });
  });

  describe('schema round-trip', () => {
    it('round-trips a workflow with params, a target, and a post-condition', async () => {
      const store = createWorkflowStore(createMemoryStorage());
      const input = newWorkflowInput({
        params: [
          { kind: 'value', name: 'query', defaultValue: 'oat milk' },
          { kind: 'secret', name: 'apiKey', secretName: 'my_api_key' },
        ],
        steps: [
          step({
            target: { selector: '#search', role: 'textbox', name: 'Search' },
            expect: { type: 'element_visible', selector: '#results' },
          }),
        ],
        authorization: policy({ allowedToolIds: ['browser.click'], allowStateChanging: true }),
      });

      const created = await store.createWorkflow(input);
      if (!created.ok) throw new Error('expected create to succeed');
      const fetched = await store.getWorkflow(created.value.id);

      expect(fetched.ok && fetched.value).toEqual(created.value);
    });
  });

  describe('corrupted persisted data', () => {
    it('surfaces a STORAGE_FAILED error when a persisted workflow no longer validates', async () => {
      const storage = createMemoryStorage();
      await storage.set(WorkflowEnvelopeMapSchema, WORKFLOWS_KEY, {
        'wf-corrupt': { schemaVersion: 1, workflow: { id: 'wf-corrupt' } },
      });
      const store = createWorkflowStore(storage);

      const result = await store.getWorkflow(toWorkflowId('wf-corrupt'));

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('STORAGE_FAILED');
    });
  });
});

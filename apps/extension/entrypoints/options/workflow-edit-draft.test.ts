import type { RunPolicy, Workflow, WorkflowParam } from '@aegis/workflows';
import { toWorkflowId, toWorkflowStepId } from '@aegis/workflows';
import { describe, expect, it } from 'vitest';

import { draftFromWorkflow, toWorkflowEdits } from './workflow-edit-draft';

const AUTHORIZATION: RunPolicy = {
  allowedToolIds: [],
  allowedOrigins: [],
  allowStateChanging: false,
};

function workflowFixture(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: toWorkflowId('workflow-1'),
    version: 0,
    name: 'Reorder oat milk',
    origin: 'https://example.com',
    params: [],
    steps: [{ stepId: toWorkflowStepId('step-1'), toolId: 'browser.click', args: {} }],
    authorization: AUTHORIZATION,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const VALUE_PARAM: WorkflowParam = {
  kind: 'value',
  name: 'quantity',
  description: 'How many to order',
  defaultValue: '2',
};

const SECRET_PARAM: WorkflowParam = {
  kind: 'secret',
  name: 'apiToken',
  secretName: 'oat_milk_token',
};

describe('draftFromWorkflow', () => {
  it('carries the name through', () => {
    const draft = draftFromWorkflow(workflowFixture({ name: 'My workflow' }));
    expect(draft.name).toBe('My workflow');
  });

  it('collects each value-kind param default, keyed by name', () => {
    const draft = draftFromWorkflow(workflowFixture({ params: [VALUE_PARAM] }));
    expect(draft.paramDefaults).toEqual({ quantity: '2' });
  });

  it('defaults a value-kind param with no defaultValue to an empty string', () => {
    const { defaultValue: _unused, ...noDefault } = VALUE_PARAM;
    const draft = draftFromWorkflow(workflowFixture({ params: [noDefault] }));
    expect(draft.paramDefaults).toEqual({ quantity: '' });
  });

  it('excludes secret-kind params entirely', () => {
    const draft = draftFromWorkflow(workflowFixture({ params: [VALUE_PARAM, SECRET_PARAM] }));
    expect(draft.paramDefaults).toEqual({ quantity: '2' });
  });
});

describe('toWorkflowEdits', () => {
  it('trims and carries the name through', () => {
    const workflow = workflowFixture();
    const draft = draftFromWorkflow(workflow);
    const edits = toWorkflowEdits({ ...draft, name: '  Renamed  ' }, workflow);
    expect(edits?.name).toBe('Renamed');
  });

  it('returns undefined for a blank name', () => {
    const workflow = workflowFixture();
    const draft = draftFromWorkflow(workflow);
    expect(toWorkflowEdits({ ...draft, name: '   ' }, workflow)).toBeUndefined();
  });

  it('updates a value-kind param default from the draft', () => {
    const workflow = workflowFixture({ params: [VALUE_PARAM] });
    const draft = draftFromWorkflow(workflow);
    const edits = toWorkflowEdits(
      { ...draft, paramDefaults: { ...draft.paramDefaults, quantity: '5' } },
      workflow,
    );
    expect(edits?.params).toEqual([{ ...VALUE_PARAM, defaultValue: '5' }]);
  });

  it('clears a value-kind param default when the draft value is blank', () => {
    const workflow = workflowFixture({ params: [VALUE_PARAM] });
    const draft = draftFromWorkflow(workflow);
    const edits = toWorkflowEdits(
      { ...draft, paramDefaults: { ...draft.paramDefaults, quantity: '   ' } },
      workflow,
    );
    const { defaultValue: _unused, ...withoutDefault } = VALUE_PARAM;
    expect(edits?.params).toEqual([withoutDefault]);
  });

  it('leaves a secret-kind param untouched', () => {
    const workflow = workflowFixture({ params: [SECRET_PARAM] });
    const draft = draftFromWorkflow(workflow);
    const edits = toWorkflowEdits(draft, workflow);
    expect(edits?.params).toEqual([SECRET_PARAM]);
  });
});

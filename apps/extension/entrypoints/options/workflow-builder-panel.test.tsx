// @vitest-environment jsdom
import type {
  RunPolicy,
  Workflow,
  WorkflowSchedule,
  WorkflowScheduleStore,
  WorkflowStore,
} from '@aegis/workflows';
import { WorkflowError, toWorkflowId, toWorkflowStepId } from '@aegis/workflows';
import { err, ok } from '@aegis/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowBuilderPanel } from './workflow-builder-panel';

const AUTHORIZATION: RunPolicy = {
  allowedToolIds: [],
  allowedOrigins: [],
  allowStateChanging: false,
};

function workflowFixture(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: toWorkflowId('workflow-1'),
    version: 2,
    name: 'Reorder oat milk',
    origin: 'https://example.com',
    params: [{ kind: 'value', name: 'quantity', defaultValue: '2' }],
    steps: [
      { stepId: toWorkflowStepId('a'), toolId: 'browser.click', args: {} },
      { stepId: toWorkflowStepId('b'), toolId: 'browser.input_text', args: {} },
    ],
    authorization: AUTHORIZATION,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function createFakeWorkflowStore(workflow: Workflow): WorkflowStore {
  let current = workflow;
  return {
    getWorkflow: (id) => Promise.resolve(ok(id === current.id ? current : undefined)),
    createWorkflow: () => {
      throw new Error('not used in this test');
    },
    updateWorkflow: (id, patch) => {
      if (id !== current.id) {
        return Promise.resolve(err(new WorkflowError('WORKFLOW_NOT_FOUND', 'not found')));
      }
      current = { ...current, ...patch, version: current.version + 1 };
      return Promise.resolve(ok(current));
    },
    removeWorkflow: () => Promise.resolve(ok(undefined)),
    listWorkflows: () => Promise.resolve(ok([current])),
  };
}

function createFakeScheduleStore(seed?: WorkflowSchedule): WorkflowScheduleStore {
  let schedule = seed;
  return {
    getSchedule: () => Promise.resolve(ok(schedule)),
    upsertSchedule: (input) => {
      schedule = {
        workflowId: input.workflowId,
        enabled: input.enabled,
        trigger: input.trigger,
        values: input.values ?? {},
        createdAt: schedule?.createdAt ?? 0,
        updatedAt: 0,
      };
      return Promise.resolve(ok(schedule));
    },
    updateSchedule: () =>
      Promise.resolve(err(new WorkflowError('WORKFLOW_NOT_FOUND', 'not implemented in this fake'))),
    removeSchedule: () => Promise.resolve(ok(undefined)),
    listSchedules: () => Promise.resolve(ok(schedule ? [schedule] : [])),
  };
}

describe('WorkflowBuilderPanel', () => {
  it('renders the workflow name, version, and steps', () => {
    const workflow = workflowFixture();
    render(
      <WorkflowBuilderPanel
        workflow={workflow}
        workflowStore={createFakeWorkflowStore(workflow)}
        scheduleStore={createFakeScheduleStore()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Reorder oat milk')).toBeInTheDocument();
    expect(screen.getByText(/v2/)).toBeInTheDocument();
    expect(screen.getByText(/1\. browser\.click/)).toBeInTheDocument();
  });

  it('deleting a step then saving persists the shorter step list', async () => {
    const workflow = workflowFixture();
    const workflowStore = createFakeWorkflowStore(workflow);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowBuilderPanel
        workflow={workflow}
        workflowStore={workflowStore}
        scheduleStore={createFakeScheduleStore()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete step 1' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    const result = await workflowStore.getWorkflow(workflow.id);
    expect(result.ok && result.value?.steps).toEqual([workflow.steps[1]]);
  });

  it('editing the run policy then saving persists it', async () => {
    const workflow = workflowFixture();
    const workflowStore = createFakeWorkflowStore(workflow);
    const user = userEvent.setup();
    render(
      <WorkflowBuilderPanel
        workflow={workflow}
        workflowStore={workflowStore}
        scheduleStore={createFakeScheduleStore()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText(/Allow state-changing steps unattended/));
    await user.type(screen.getByLabelText(/Allowed tool ids/), 'browser.click');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const result = await workflowStore.getWorkflow(workflow.id);
      expect(result.ok && result.value?.authorization).toEqual({
        allowedToolIds: ['browser.click'],
        allowedOrigins: [],
        allowStateChanging: true,
      });
    });
  });

  it('rejects saving a blank name without calling onClose', async () => {
    const workflow = workflowFixture();
    const workflowStore = createFakeWorkflowStore(workflow);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowBuilderPanel
        workflow={workflow}
        workflowStore={workflowStore}
        scheduleStore={createFakeScheduleStore()}
        onClose={onClose}
      />,
    );

    await user.clear(screen.getByDisplayValue('Reorder oat milk'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Cancel calls onClose without persisting any change', async () => {
    const workflow = workflowFixture();
    const workflowStore = createFakeWorkflowStore(workflow);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowBuilderPanel
        workflow={workflow}
        workflowStore={workflowStore}
        scheduleStore={createFakeScheduleStore()}
        onClose={onClose}
      />,
    );

    await user.clear(screen.getByDisplayValue('Reorder oat milk'));
    await user.type(screen.getByLabelText('Name'), 'Should not persist');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    const result = await workflowStore.getWorkflow(workflow.id);
    expect(result.ok && result.value?.name).toBe('Reorder oat milk');
  });

  it('"Back to list" also calls onClose', async () => {
    const workflow = workflowFixture();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowBuilderPanel
        workflow={workflow}
        workflowStore={createFakeWorkflowStore(workflow)}
        scheduleStore={createFakeScheduleStore()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Back to list' }));

    expect(onClose).toHaveBeenCalled();
  });
});

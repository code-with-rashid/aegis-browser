// @vitest-environment jsdom
import type {
  RunPolicy,
  Workflow,
  WorkflowParam,
  WorkflowRunRecord,
  WorkflowRunStore,
  WorkflowScheduleStore,
  WorkflowStepResult,
  WorkflowStore,
} from '@aegis/workflows';
import { WorkflowError, toRunRecordId, toWorkflowId, toWorkflowStepId } from '@aegis/workflows';
import { err, ok, type Result } from '@aegis/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { TriggerWorkflowRunError, WorkflowRunTrigger } from './workflow-run-trigger';
import { WorkflowLibraryPanel } from './workflow-library-panel';

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

function runRecordFixture(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    id: toRunRecordId('run-1'),
    workflowId: toWorkflowId('workflow-1'),
    status: 'completed',
    values: {},
    nextStepIndex: 1,
    stepResults: [
      { stepId: toWorkflowStepId('step-1'), toolId: 'browser.click', succeeded: true },
    ] satisfies WorkflowStepResult[],
    startedAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function createFakeWorkflowStore(seed: readonly Workflow[] = []): WorkflowStore {
  const workflows = new Map(seed.map((workflow) => [workflow.id, workflow]));
  return {
    getWorkflow: (id) => Promise.resolve(ok(workflows.get(id))),
    createWorkflow: (input) => {
      const workflow: Workflow = {
        id: input.id,
        version: 0,
        name: input.name,
        origin: input.origin,
        params: input.params ?? [],
        steps: input.steps,
        authorization: input.authorization,
        createdAt: 0,
        updatedAt: 0,
      };
      workflows.set(workflow.id, workflow);
      return Promise.resolve(ok(workflow));
    },
    updateWorkflow: (id, patch) => {
      const current = workflows.get(id);
      if (current === undefined) {
        return Promise.resolve(err(new WorkflowError('WORKFLOW_NOT_FOUND', 'not found')));
      }
      const updated: Workflow = { ...current, ...patch, version: current.version + 1 };
      workflows.set(id, updated);
      return Promise.resolve(ok(updated));
    },
    removeWorkflow: (id) => {
      workflows.delete(id);
      return Promise.resolve(ok(undefined));
    },
    listWorkflows: () => Promise.resolve(ok([...workflows.values()])),
  };
}

function createFakeWorkflowRunStore(seed: readonly WorkflowRunRecord[] = []): WorkflowRunStore {
  const runs = new Map(seed.map((run) => [run.id, run]));
  return {
    createRun: (input) => {
      const record: WorkflowRunRecord = {
        id: input.id,
        workflowId: input.workflowId,
        status: 'running',
        values: input.values,
        nextStepIndex: 0,
        stepResults: [],
        startedAt: 0,
        updatedAt: 0,
      };
      runs.set(record.id, record);
      return Promise.resolve(ok(record));
    },
    getRun: (id) => Promise.resolve(ok(runs.get(id))),
    updateRun: (id, patch) => {
      const current = runs.get(id);
      if (current === undefined) {
        return Promise.resolve(err(new WorkflowError('RUN_RECORD_NOT_FOUND', 'not found')));
      }
      const updated = { ...current, ...patch };
      runs.set(id, updated);
      return Promise.resolve(ok(updated));
    },
    listRuns: () => Promise.resolve(ok([...runs.values()])),
    listRunningRuns: () =>
      Promise.resolve(ok([...runs.values()].filter((run) => run.status === 'running'))),
    listRunsForWorkflow: (workflowId) =>
      Promise.resolve(
        ok(
          [...runs.values()]
            .filter((run) => run.workflowId === workflowId)
            .sort((a, b) => b.startedAt - a.startedAt),
        ),
      ),
  };
}

function createFakeScheduleStore(): WorkflowScheduleStore {
  return {
    getSchedule: () => Promise.resolve(ok(undefined)),
    upsertSchedule: (input) =>
      Promise.resolve(
        ok({
          workflowId: input.workflowId,
          enabled: input.enabled,
          trigger: input.trigger,
          values: input.values ?? {},
          createdAt: 0,
          updatedAt: 0,
        }),
      ),
    updateSchedule: () =>
      Promise.resolve(err(new WorkflowError('WORKFLOW_NOT_FOUND', 'not implemented in this fake'))),
    removeSchedule: () => Promise.resolve(ok(undefined)),
    listSchedules: () => Promise.resolve(ok([])),
  };
}

interface FakeTriggerCall {
  readonly workflowId: string;
  readonly values: Readonly<Record<string, string>>;
}

function createFakeRunTrigger(
  respond: (call: FakeTriggerCall) => Result<{ runId: string }, TriggerWorkflowRunError>,
): { trigger: WorkflowRunTrigger; calls: FakeTriggerCall[] } {
  const calls: FakeTriggerCall[] = [];
  return {
    calls,
    trigger: {
      triggerRun: (workflowId, values) => {
        calls.push({ workflowId, values });
        return Promise.resolve(respond({ workflowId, values }));
      },
    },
  };
}

describe('WorkflowLibraryPanel', () => {
  it('shows an empty-state message when there are no workflows', async () => {
    render(
      <WorkflowLibraryPanel
        workflowStore={createFakeWorkflowStore()}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={createFakeRunTrigger(() => ok({ runId: 'run-1' })).trigger}
      />,
    );

    expect(await screen.findByText(/No workflows recorded yet/)).toBeInTheDocument();
  });

  it('lists existing workflows', async () => {
    render(
      <WorkflowLibraryPanel
        workflowStore={createFakeWorkflowStore([workflowFixture({ name: 'Reorder oat milk' })])}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={createFakeRunTrigger(() => ok({ runId: 'run-1' })).trigger}
      />,
    );

    expect(await screen.findByText('Reorder oat milk')).toBeInTheDocument();
  });

  it('expanding Run shows a text input per value-kind param, none for a secret-kind param', async () => {
    const valueParam: WorkflowParam = { kind: 'value', name: 'quantity', defaultValue: '2' };
    const secretParam: WorkflowParam = {
      kind: 'secret',
      name: 'apiToken',
      secretName: 'oat_milk_token',
    };
    const user = userEvent.setup();
    render(
      <WorkflowLibraryPanel
        workflowStore={createFakeWorkflowStore([
          workflowFixture({ params: [valueParam, secretParam] }),
        ])}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={createFakeRunTrigger(() => ok({ runId: 'run-1' })).trigger}
      />,
    );

    await screen.findByText('Reorder oat milk');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.getByText(/quantity/)).toBeInTheDocument();
    expect(screen.queryByText(/apiToken/)).not.toBeInTheDocument();
  });

  it('starting a run calls the trigger with entered values and shows the started runId', async () => {
    const valueParam: WorkflowParam = { kind: 'value', name: 'quantity', defaultValue: '2' };
    const { trigger, calls } = createFakeRunTrigger(() => ok({ runId: 'run-42' }));
    const user = userEvent.setup();
    render(
      <WorkflowLibraryPanel
        workflowStore={createFakeWorkflowStore([workflowFixture({ params: [valueParam] })])}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={trigger}
      />,
    );

    await screen.findByText('Reorder oat milk');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.type(screen.getByLabelText(/quantity/), '5');
    await user.click(screen.getByRole('button', { name: 'Start run' }));

    expect(await screen.findByText(/Run started \(run-42\)/)).toBeInTheDocument();
    expect(calls).toEqual([{ workflowId: 'workflow-1', values: { quantity: '5' } }]);
  });

  it('shows an error message when the trigger reports a failure to start', async () => {
    const { trigger } = createFakeRunTrigger(() =>
      err({ message: 'run policy denies this origin' }),
    );
    const user = userEvent.setup();
    render(
      <WorkflowLibraryPanel
        workflowStore={createFakeWorkflowStore([workflowFixture()])}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={trigger}
      />,
    );

    await screen.findByText('Reorder oat milk');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('button', { name: 'Start run' }));

    expect(await screen.findByText('run policy denies this origin')).toBeInTheDocument();
  });

  it("expanding History lazy-loads and shows that workflow's past runs with their trace", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowLibraryPanel
        workflowStore={createFakeWorkflowStore([workflowFixture()])}
        runStore={createFakeWorkflowRunStore([runRecordFixture()])}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={createFakeRunTrigger(() => ok({ runId: 'run-1' })).trigger}
      />,
    );

    await screen.findByText('Reorder oat milk');
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.getByText(/browser\.click/)).toBeInTheDocument();
  });

  it('shows "No runs yet" for a workflow with no run history', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowLibraryPanel
        workflowStore={createFakeWorkflowStore([workflowFixture()])}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={createFakeRunTrigger(() => ok({ runId: 'run-1' })).trigger}
      />,
    );

    await screen.findByText('Reorder oat milk');
    await user.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByText('No runs yet.')).toBeInTheDocument();
  });

  it('"Edit" swaps the list for the WorkflowBuilderPanel, and "Back to list" returns to it', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowLibraryPanel
        workflowStore={createFakeWorkflowStore([workflowFixture()])}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={createFakeRunTrigger(() => ok({ runId: 'run-1' })).trigger}
      />,
    );

    await screen.findByText('Reorder oat milk');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByText('Edit workflow')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to list' }));

    expect(screen.getByText('Reorder oat milk')).toBeInTheDocument();
    expect(screen.queryByText('Edit workflow')).not.toBeInTheDocument();
  });

  it('saving in the builder persists the new name back in the list', async () => {
    const workflowStore = createFakeWorkflowStore([workflowFixture()]);
    const user = userEvent.setup();
    render(
      <WorkflowLibraryPanel
        workflowStore={workflowStore}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={createFakeRunTrigger(() => ok({ runId: 'run-1' })).trigger}
      />,
    );

    await screen.findByText('Reorder oat milk');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const nameInput = screen.getByDisplayValue('Reorder oat milk');
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed workflow');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Renamed workflow')).toBeInTheDocument();
    const result = await workflowStore.getWorkflow(toWorkflowId('workflow-1'));
    expect(result.ok && result.value?.name).toBe('Renamed workflow');
  });

  it('deletes a workflow with no confirmation step', async () => {
    const workflowStore = createFakeWorkflowStore([workflowFixture()]);
    const user = userEvent.setup();
    render(
      <WorkflowLibraryPanel
        workflowStore={workflowStore}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={createFakeRunTrigger(() => ok({ runId: 'run-1' })).trigger}
      />,
    );

    await screen.findByText('Reorder oat milk');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.getByText(/No workflows recorded yet/)).toBeInTheDocument();
    });
    const result = await workflowStore.listWorkflows();
    expect(result.ok && result.value).toEqual([]);
  });

  it('Run/History buttons report aria-expanded matching the currently open section', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowLibraryPanel
        workflowStore={createFakeWorkflowStore([workflowFixture()])}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={createFakeRunTrigger(() => ok({ runId: 'run-1' })).trigger}
      />,
    );

    await screen.findByText('Reorder oat milk');
    const runButton = screen.getByRole('button', { name: 'Run' });
    const historyButton = screen.getByRole('button', { name: 'History' });
    expect(runButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(runButton);
    expect(runButton).toHaveAttribute('aria-expanded', 'true');
    expect(runButton.getAttribute('aria-controls')).toMatch(/^run-/);

    await user.click(historyButton);
    expect(historyButton).toHaveAttribute('aria-expanded', 'true');
    expect(runButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('lists multiple workflows sorted by name', async () => {
    render(
      <WorkflowLibraryPanel
        workflowStore={createFakeWorkflowStore([
          workflowFixture({ id: toWorkflowId('workflow-b'), name: 'Zebra workflow' }),
          workflowFixture({ id: toWorkflowId('workflow-a'), name: 'Apple workflow' }),
        ])}
        runStore={createFakeWorkflowRunStore()}
        scheduleStore={createFakeScheduleStore()}
        runTrigger={createFakeRunTrigger(() => ok({ runId: 'run-1' })).trigger}
      />,
    );

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/^Apple workflow/);
    expect(items[1]).toHaveTextContent(/^Zebra workflow/);
  });
});

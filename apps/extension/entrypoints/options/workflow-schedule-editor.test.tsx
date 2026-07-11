// @vitest-environment jsdom
import type { WorkflowSchedule, WorkflowScheduleStore } from '@aegis/workflows';
import { WorkflowError, toWorkflowId } from '@aegis/workflows';
import { err, ok } from '@aegis/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { WorkflowScheduleEditor } from './workflow-schedule-editor';

const WORKFLOW_ID = toWorkflowId('workflow-1');

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
    removeSchedule: () => {
      schedule = undefined;
      return Promise.resolve(ok(undefined));
    },
    listSchedules: () => Promise.resolve(ok(schedule ? [schedule] : [])),
  };
}

describe('WorkflowScheduleEditor', () => {
  it('defaults to a disabled interval schedule when none exists yet', async () => {
    render(
      <WorkflowScheduleEditor workflowId={WORKFLOW_ID} scheduleStore={createFakeScheduleStore()} />,
    );

    expect(await screen.findByLabelText('Enable scheduling')).not.toBeChecked();
    expect(screen.getByLabelText(/Every \(minutes\)/)).toBeInTheDocument();
  });

  it('loads an existing daily schedule', async () => {
    const store = createFakeScheduleStore({
      workflowId: WORKFLOW_ID,
      enabled: true,
      trigger: { kind: 'daily', hour: 9, minute: 30 },
      values: {},
      createdAt: 0,
      updatedAt: 0,
    });
    render(<WorkflowScheduleEditor workflowId={WORKFLOW_ID} scheduleStore={store} />);

    expect(await screen.findByLabelText('Enable scheduling')).toBeChecked();
    expect(screen.getByLabelText(/Hour/)).toHaveValue('9');
    expect(screen.getByLabelText(/Minute/)).toHaveValue('30');
  });

  it('saves an interval schedule via upsertSchedule', async () => {
    const store = createFakeScheduleStore();
    const user = userEvent.setup();
    render(<WorkflowScheduleEditor workflowId={WORKFLOW_ID} scheduleStore={store} />);

    await screen.findByLabelText('Enable scheduling');
    await user.click(screen.getByLabelText('Enable scheduling'));
    await user.clear(screen.getByLabelText(/Every \(minutes\)/));
    await user.type(screen.getByLabelText(/Every \(minutes\)/), '15');
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));

    await waitFor(async () => {
      const result = await store.getSchedule(WORKFLOW_ID);
      expect(result.ok && result.value).toMatchObject({
        enabled: true,
        trigger: { kind: 'interval', everyMinutes: 15 },
      });
    });
  });

  it('shows an error and does not save when the interval is invalid', async () => {
    const store = createFakeScheduleStore();
    const user = userEvent.setup();
    render(<WorkflowScheduleEditor workflowId={WORKFLOW_ID} scheduleStore={store} />);

    await screen.findByLabelText('Enable scheduling');
    await user.clear(screen.getByLabelText(/Every \(minutes\)/));
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));

    expect(await screen.findByText('Enter a valid interval/time.')).toBeInTheDocument();
    const result = await store.getSchedule(WORKFLOW_ID);
    expect(result.ok && result.value).toBeUndefined();
  });

  it('switching to a daily trigger shows hour/minute fields instead', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowScheduleEditor workflowId={WORKFLOW_ID} scheduleStore={createFakeScheduleStore()} />,
    );

    await screen.findByLabelText('Enable scheduling');
    await user.selectOptions(screen.getByLabelText('Trigger'), 'daily');

    expect(screen.getByLabelText(/Hour/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Every \(minutes\)/)).not.toBeInTheDocument();
  });
});

import type { WorkflowSchedule } from '@aegis/workflows';
import { toWorkflowId } from '@aegis/workflows';
import { describe, expect, it } from 'vitest';

import { draftFromSchedule, scheduleTriggerFromDraft } from './workflow-schedule-draft';

function scheduleFixture(overrides: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    workflowId: toWorkflowId('workflow-1'),
    enabled: true,
    trigger: { kind: 'interval', everyMinutes: 30 },
    values: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('draftFromSchedule', () => {
  it('returns a disabled interval default when there is no schedule yet', () => {
    const draft = draftFromSchedule(undefined);
    expect(draft.enabled).toBe(false);
    expect(draft.kind).toBe('interval');
  });

  it('carries an interval schedule through', () => {
    const draft = draftFromSchedule(
      scheduleFixture({ trigger: { kind: 'interval', everyMinutes: 45 } }),
    );
    expect(draft).toMatchObject({ enabled: true, kind: 'interval', everyMinutes: '45' });
  });

  it('carries a daily schedule through', () => {
    const draft = draftFromSchedule(
      scheduleFixture({ enabled: false, trigger: { kind: 'daily', hour: 9, minute: 30 } }),
    );
    expect(draft).toMatchObject({ enabled: false, kind: 'daily', hour: '9', minute: '30' });
  });
});

describe('scheduleTriggerFromDraft', () => {
  it('builds an interval trigger from a valid positive number', () => {
    expect(
      scheduleTriggerFromDraft({
        enabled: true,
        kind: 'interval',
        everyMinutes: '30',
        hour: '0',
        minute: '0',
      }),
    ).toEqual({ kind: 'interval', everyMinutes: 30 });
  });

  it('rejects a non-positive interval', () => {
    expect(
      scheduleTriggerFromDraft({
        enabled: true,
        kind: 'interval',
        everyMinutes: '0',
        hour: '0',
        minute: '0',
      }),
    ).toBeUndefined();
  });

  it('builds a daily trigger from valid hour/minute', () => {
    expect(
      scheduleTriggerFromDraft({
        enabled: true,
        kind: 'daily',
        everyMinutes: '60',
        hour: '14',
        minute: '30',
      }),
    ).toEqual({ kind: 'daily', hour: 14, minute: 30 });
  });

  it('rejects an out-of-range hour', () => {
    expect(
      scheduleTriggerFromDraft({
        enabled: true,
        kind: 'daily',
        everyMinutes: '60',
        hour: '24',
        minute: '0',
      }),
    ).toBeUndefined();
  });

  it('rejects an out-of-range minute', () => {
    expect(
      scheduleTriggerFromDraft({
        enabled: true,
        kind: 'daily',
        everyMinutes: '60',
        hour: '0',
        minute: '60',
      }),
    ).toBeUndefined();
  });

  it('rejects a non-numeric field', () => {
    expect(
      scheduleTriggerFromDraft({
        enabled: true,
        kind: 'interval',
        everyMinutes: 'not a number',
        hour: '0',
        minute: '0',
      }),
    ).toBeUndefined();
  });
});

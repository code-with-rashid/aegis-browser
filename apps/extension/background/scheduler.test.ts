import { createDefaultToolRegistry, createFakeTabManager } from '@aegis/actions';
import type { LoopServices } from '@aegis/agent';
import { createFakeCdp } from '@aegis/perception';
import {
  createMemoryStorage,
  ok,
  toElementRef,
  type Result,
  type StoragePort,
} from '@aegis/shared';
import {
  createWorkflowRunStore,
  createWorkflowStore,
  toWorkflowId,
  toWorkflowStepId,
} from '@aegis/workflows';
import { describe, expect, it } from 'vitest';

import { createBackgroundRunManager } from './background-run-manager';
import type { BuildLoopServicesError, BuiltLoop } from './build-loop-services';
import { createScheduler } from './scheduler';

const POLL_TIMEOUT_MS = 1000;

function mockServices(): LoopServices {
  return {
    perceive: () =>
      Promise.resolve(
        ok({
          elements: [],
          content: { text: '', truncated: false },
          tokenEstimate: 0,
          truncated: false,
        }),
      ),
    plan: () => Promise.resolve(ok({ subGoal: 'do the thing', taskComplete: false })),
    decide: () =>
      Promise.resolve(
        ok({
          actions: [{ type: 'click', ref: toElementRef('ax:1') }],
          toolCalls: [],
          stuck: false,
        }),
      ),
    checkPolicy: () => Promise.resolve(ok({ decision: 'allow' })),
    checkAlignment: () => Promise.resolve(ok({ aligned: true, reasoning: 'ok' })),
    act: () => Promise.resolve({ kind: 'completed', results: [] }),
    verify: () => Promise.resolve(ok({ outcome: 'achieved', taskComplete: true })),
  };
}

function fakeBuildLoop(): (
  storage: StoragePort,
  tabId: number,
) => Promise<Result<BuiltLoop, BuildLoopServicesError>> {
  return (_storage, tabId) =>
    Promise.resolve(
      ok({
        services: mockServices(),
        executorContext: { session: createFakeCdp(tabId), tabManager: createFakeTabManager(tabId) },
        toolRegistry: createDefaultToolRegistry(),
        attach: () => Promise.resolve(ok(undefined)),
        detach: () => Promise.resolve(ok(undefined)),
      }),
    );
}

function twoStepWorkflowInput() {
  return {
    id: toWorkflowId('check-order-status'),
    name: 'Check order status',
    origin: 'https://shop.example.com',
    steps: [
      { stepId: toWorkflowStepId('step-1'), toolId: 'browser.wait', args: { type: 'wait', ms: 1 } },
      { stepId: toWorkflowStepId('step-2'), toolId: 'browser.wait', args: { type: 'wait', ms: 1 } },
    ],
    authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false },
  };
}

async function waitUntil(predicate: () => Promise<boolean>): Promise<void> {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('createScheduler', () => {
  it('checkSchedules starts a background run for a due, enabled schedule and records lastRunAt', async () => {
    const runStorage = createMemoryStorage();
    const workflowStorage = createMemoryStorage();
    const workflowStore = createWorkflowStore(workflowStorage);
    await workflowStore.createWorkflow(twoStepWorkflowInput());
    const runManager = createBackgroundRunManager(
      runStorage,
      workflowStorage,
      1,
      fakeBuildLoop(),
      () => Promise.resolve(ok({ tabId: 42 })),
      () => Promise.resolve(ok(undefined)),
      () => 'run-1',
    );
    const scheduleStorage = createMemoryStorage();
    const scheduler = createScheduler(scheduleStorage, runManager);
    await scheduler.schedules.upsertSchedule({
      workflowId: toWorkflowId('check-order-status'),
      enabled: true,
      trigger: { kind: 'interval', everyMinutes: 60 },
    });

    const now = Date.now();
    await scheduler.checkSchedules(now);

    const schedule = await scheduler.schedules.getSchedule(toWorkflowId('check-order-status'));
    expect(schedule.ok && schedule.value?.lastRunAt).toBe(now);

    const runStore = createWorkflowRunStore(runStorage);
    await waitUntil(async () => {
      const runs = await runStore.listRunsForWorkflow(toWorkflowId('check-order-status'));
      return runs.ok && runs.value.length > 0 && runs.value[0]?.status !== 'running';
    });
    const history = await runStore.listRunsForWorkflow(toWorkflowId('check-order-status'));
    expect(history.ok && history.value).toHaveLength(1);
    expect(history.ok && history.value[0]?.status).toBe('completed');
  });

  it('checkSchedules does not start a run for a disabled schedule', async () => {
    const runStorage = createMemoryStorage();
    const workflowStorage = createMemoryStorage();
    const workflowStore = createWorkflowStore(workflowStorage);
    await workflowStore.createWorkflow(twoStepWorkflowInput());
    let started = false;
    const runManager = createBackgroundRunManager(
      runStorage,
      workflowStorage,
      1,
      fakeBuildLoop(),
      () => {
        started = true;
        return Promise.resolve(ok({ tabId: 42 }));
      },
      () => Promise.resolve(ok(undefined)),
    );
    const scheduler = createScheduler(createMemoryStorage(), runManager);
    await scheduler.schedules.upsertSchedule({
      workflowId: toWorkflowId('check-order-status'),
      enabled: false,
      trigger: { kind: 'interval', everyMinutes: 60 },
    });

    await scheduler.checkSchedules(Date.now());

    expect(started).toBe(false);
  });

  it('checkSchedules does not start a run before an interval schedule is due', async () => {
    const runStorage = createMemoryStorage();
    const workflowStorage = createMemoryStorage();
    const workflowStore = createWorkflowStore(workflowStorage);
    await workflowStore.createWorkflow(twoStepWorkflowInput());
    let started = false;
    const runManager = createBackgroundRunManager(
      runStorage,
      workflowStorage,
      1,
      fakeBuildLoop(),
      () => {
        started = true;
        return Promise.resolve(ok({ tabId: 42 }));
      },
      () => Promise.resolve(ok(undefined)),
    );
    const scheduler = createScheduler(createMemoryStorage(), runManager);
    const now = Date.now();
    await scheduler.schedules.upsertSchedule({
      workflowId: toWorkflowId('check-order-status'),
      enabled: true,
      trigger: { kind: 'interval', everyMinutes: 60 },
    });
    await scheduler.schedules.updateSchedule(toWorkflowId('check-order-status'), {
      lastRunAt: now,
    });

    await scheduler.checkSchedules(now + 60_000); // only 1 minute later, interval is 60

    expect(started).toBe(false);
  });

  it('triggerNow starts a background run immediately, regardless of any schedule', async () => {
    const runStorage = createMemoryStorage();
    const workflowStorage = createMemoryStorage();
    const workflowStore = createWorkflowStore(workflowStorage);
    await workflowStore.createWorkflow(twoStepWorkflowInput());
    const runManager = createBackgroundRunManager(
      runStorage,
      workflowStorage,
      1,
      fakeBuildLoop(),
      () => Promise.resolve(ok({ tabId: 42 })),
      () => Promise.resolve(ok(undefined)),
      () => 'run-1',
    );
    const scheduler = createScheduler(createMemoryStorage(), runManager);

    const result = await scheduler.triggerNow(toWorkflowId('check-order-status'), {});

    expect(result.ok).toBe(true);
  });
});

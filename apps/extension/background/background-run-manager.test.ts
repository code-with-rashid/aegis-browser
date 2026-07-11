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
  toRunRecordId,
  toWorkflowId,
  toWorkflowStepId,
} from '@aegis/workflows';
import { describe, expect, it } from 'vitest';

import type { BuildLoopServicesError, BuiltLoop } from './build-loop-services';
import { createBackgroundRunManager } from './background-run-manager';
import type { closeManagedTab, openManagedTab } from './managed-tab';

const POLL_TIMEOUT_MS = 1000;

function mockServices(overrides: Partial<LoopServices> = {}): LoopServices {
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
    ...overrides,
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

function fakeOpenTab(nextTabId: () => number): typeof openManagedTab {
  return () => Promise.resolve(ok({ tabId: nextTabId() }));
}

function fakeCloseTab(closedTabIds: number[]): typeof closeManagedTab {
  return (tabId) => {
    closedTabIds.push(tabId);
    return Promise.resolve(ok(undefined));
  };
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

describe('createBackgroundRunManager', () => {
  it('starts a background run on a managed (non-active) tab and completes it', async () => {
    const runStorage = createMemoryStorage();
    const workflowStorage = createMemoryStorage();
    const workflowStore = createWorkflowStore(workflowStorage);
    await workflowStore.createWorkflow(twoStepWorkflowInput());
    const closedTabIds: number[] = [];
    let idCounter = 0;
    const manager = createBackgroundRunManager(
      runStorage,
      workflowStorage,
      /* maxConcurrentRuns */ 1,
      fakeBuildLoop(),
      fakeOpenTab(() => 42),
      fakeCloseTab(closedTabIds),
      () => `run-${(idCounter += 1)}`,
    );

    const started = await manager.startBackgroundRun(toWorkflowId('check-order-status'), {});

    expect(started.ok).toBe(true);
    expect(started.ok && started.value.tabId).toBe(42);

    const runStore = createWorkflowRunStore(runStorage);
    await waitUntil(async () => {
      const record = await runStore.getRun(toRunRecordId('run-1'));
      return record.ok && record.value?.status !== 'running';
    });

    const finalRecord = await runStore.getRun(toRunRecordId('run-1'));
    expect(finalRecord.ok && finalRecord.value?.status).toBe('completed');
    expect(closedTabIds).toEqual([42]);
  });

  it('fails with WORKFLOW_NOT_FOUND without opening a tab', async () => {
    const runStorage = createMemoryStorage();
    const workflowStorage = createMemoryStorage();
    let tabOpened = false;
    const manager = createBackgroundRunManager(
      runStorage,
      workflowStorage,
      1,
      fakeBuildLoop(),
      () => {
        tabOpened = true;
        return Promise.resolve(ok({ tabId: 1 }));
      },
      fakeCloseTab([]),
    );

    const result = await manager.startBackgroundRun(toWorkflowId('missing'), {});

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('WORKFLOW_NOT_FOUND');
    expect(tabOpened).toBe(false);
  });

  it('rejects a new run at the concurrency limit, without opening a tab', async () => {
    const runStorage = createMemoryStorage();
    const workflowStorage = createMemoryStorage();
    const workflowStore = createWorkflowStore(workflowStorage);
    await workflowStore.createWorkflow(twoStepWorkflowInput());
    let openCalls = 0;
    let idCounter = 0;
    // A buildLoop that never resolves attach() — keeps the first run "in flight" forever,
    // so the concurrency slot is never released within this test.
    const neverAttaches: typeof fakeBuildLoop = () => () =>
      Promise.resolve(
        ok({
          services: mockServices(),
          executorContext: { session: createFakeCdp(1), tabManager: createFakeTabManager(1) },
          toolRegistry: createDefaultToolRegistry(),
          attach: () =>
            new Promise(() => {
              // never resolves
            }),
          detach: () => Promise.resolve(ok(undefined)),
        }),
      );
    const manager = createBackgroundRunManager(
      runStorage,
      workflowStorage,
      1,
      neverAttaches(),
      () => {
        openCalls += 1;
        return Promise.resolve(ok({ tabId: openCalls }));
      },
      fakeCloseTab([]),
      () => `run-${(idCounter += 1)}`,
    );

    const first = await manager.startBackgroundRun(toWorkflowId('check-order-status'), {});
    expect(first.ok).toBe(true);

    const second = await manager.startBackgroundRun(toWorkflowId('check-order-status'), {});

    expect(second.ok).toBe(false);
    expect(!second.ok && second.error.code).toBe('CONCURRENCY_LIMIT_REACHED');
    expect(openCalls).toBe(1);
  });

  it('resumes a persisted running record on initialize(), reattaching to its recorded tab', async () => {
    const runStorage = createMemoryStorage();
    const workflowStorage = createMemoryStorage();
    const workflowStore = createWorkflowStore(workflowStorage);
    await workflowStore.createWorkflow(twoStepWorkflowInput());
    const runStore = createWorkflowRunStore(runStorage);
    const created = await runStore.createRun({
      id: toRunRecordId('run-1'),
      workflowId: toWorkflowId('check-order-status'),
      values: {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error('expected a run record');
    }
    await runStore.updateRun(created.value.id, { tabId: 7 });

    // simulate a fresh service worker: a brand-new manager instance over the same storage.
    let reattachedTabId: number | undefined;
    const manager = createBackgroundRunManager(
      runStorage,
      workflowStorage,
      1,
      (storage, tabId) => {
        reattachedTabId = tabId;
        return fakeBuildLoop()(storage, tabId);
      },
      fakeOpenTab(() => 999),
      fakeCloseTab([]),
    );

    await manager.initialize();

    await waitUntil(async () => {
      const record = await runStore.getRun(toRunRecordId('run-1'));
      return record.ok && record.value?.status !== 'running';
    });

    expect(reattachedTabId).toBe(7);
    const finalRecord = await runStore.getRun(toRunRecordId('run-1'));
    expect(finalRecord.ok && finalRecord.value?.status).toBe('completed');
  });

  it('marks a running record failed on initialize() if it has no recorded tab', async () => {
    const runStorage = createMemoryStorage();
    const workflowStorage = createMemoryStorage();
    const runStore = createWorkflowRunStore(runStorage);
    await runStore.createRun({
      id: toRunRecordId('run-1'),
      workflowId: toWorkflowId('check-order-status'),
      values: {},
    });
    const manager = createBackgroundRunManager(
      runStorage,
      workflowStorage,
      1,
      fakeBuildLoop(),
      fakeOpenTab(() => 1),
      fakeCloseTab([]),
    );

    await manager.initialize();

    const record = await runStore.getRun(toRunRecordId('run-1'));
    expect(record.ok && record.value?.status).toBe('failed');
  });

  describe('unattended-mode guardrails (#117)', () => {
    it('rejects a new run with RATE_LIMIT_REACHED once maxRunsPerDay is reached, without opening a tab', async () => {
      const runStorage = createMemoryStorage();
      const workflowStorage = createMemoryStorage();
      const workflowStore = createWorkflowStore(workflowStorage);
      await workflowStore.createWorkflow({
        ...twoStepWorkflowInput(),
        authorization: {
          allowedToolIds: [],
          allowedOrigins: [],
          allowStateChanging: false,
          maxRunsPerDay: 1,
        },
      });
      const runStore = createWorkflowRunStore(runStorage);
      await runStore.createRun({
        id: toRunRecordId('earlier-run'),
        workflowId: toWorkflowId('check-order-status'),
        values: {},
      });
      let tabOpened = false;
      const manager = createBackgroundRunManager(
        runStorage,
        workflowStorage,
        1,
        fakeBuildLoop(),
        () => {
          tabOpened = true;
          return Promise.resolve(ok({ tabId: 1 }));
        },
        fakeCloseTab([]),
      );

      const result = await manager.startBackgroundRun(toWorkflowId('check-order-status'), {});

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('RATE_LIMIT_REACHED');
      expect(tabOpened).toBe(false);
    });

    it('notifies when a run hard-stops on an out-of-policy state-changing step', async () => {
      const runStorage = createMemoryStorage();
      const workflowStorage = createMemoryStorage();
      const workflowStore = createWorkflowStore(workflowStorage);
      await workflowStore.createWorkflow({
        id: toWorkflowId('checkout'),
        name: 'Checkout',
        origin: 'https://shop.example.com',
        steps: [
          {
            stepId: toWorkflowStepId('step-1'),
            toolId: 'browser.click',
            args: { type: 'click', ref: 'ax:1' },
            target: { ref: 'ax:1', name: 'Submit Order' },
          },
        ],
        authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false },
      });
      let notified: { workflowName: string; reason: string } | undefined;
      const manager = createBackgroundRunManager(
        runStorage,
        workflowStorage,
        1,
        fakeBuildLoop(),
        fakeOpenTab(() => 42),
        fakeCloseTab([]),
        () => 'run-1',
        (workflowName, reason) => {
          notified = { workflowName, reason };
          return Promise.resolve(ok(undefined));
        },
      );

      await manager.startBackgroundRun(toWorkflowId('checkout'), {});

      const runStore = createWorkflowRunStore(runStorage);
      await waitUntil(async () => {
        const record = await runStore.getRun(toRunRecordId('run-1'));
        return record.ok && record.value?.status !== 'running';
      });

      const record = await runStore.getRun(toRunRecordId('run-1'));
      expect(record.ok && record.value?.status).toBe('hard_stopped');
      expect(notified?.workflowName).toBe('Checkout');
      expect(notified?.reason).toContain('state-changing');
    });
  });
});

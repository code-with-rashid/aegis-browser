import { createFakeTabManager, type ExecutorContext } from '@aegis/actions';
import {
  createAgentLoopMachine,
  hydrateAgentLoopSnapshot,
  persistAgentLoopOnTransition,
  type LoopServices,
} from '@aegis/agent';
import { createFakeCdp, type PerceptionPayload } from '@aegis/perception';
import {
  createMemoryStorage,
  ok,
  toElementRef,
  type Result,
  type StoragePort,
} from '@aegis/shared';
import { createActor, waitFor } from 'xstate';
import { describe, expect, it } from 'vitest';

import { createFakePortPair } from '../messaging/fake-port';
import type { BackgroundToPanelMessage, PanelToBackgroundMessage } from '../messaging/protocol';
import type { BuildLoopServicesError, BuiltLoop } from './build-loop-services';
import { createRunManager } from './run-manager';

const WAIT_TIMEOUT = 1000;

function perceptionFixture(): PerceptionPayload {
  return {
    elements: [],
    content: { text: '', truncated: false },
    tokenEstimate: 0,
    truncated: false,
  };
}

function mockServices(overrides: Partial<LoopServices> = {}): LoopServices {
  return {
    perceive: () => Promise.resolve(ok(perceptionFixture())),
    plan: () => Promise.resolve(ok({ subGoal: 'do the thing', taskComplete: false })),
    decide: () =>
      Promise.resolve(
        ok({ actions: [{ type: 'click', ref: toElementRef('ax:1') }], stuck: false }),
      ),
    checkPolicy: () => Promise.resolve(ok({ decision: 'allow' })),
    checkAlignment: () => Promise.resolve(ok({ aligned: true, reasoning: 'ok' })),
    act: () => Promise.resolve({ kind: 'completed', results: [] }),
    verify: () => Promise.resolve(ok({ outcome: 'achieved', taskComplete: true })),
    ...overrides,
  };
}

function fakeExecutorContext(tabId: number): ExecutorContext {
  return { session: createFakeCdp(tabId), tabManager: createFakeTabManager(tabId) };
}

function fakeBuildLoop(
  servicesOverrides: Partial<LoopServices> = {},
  attachResult: Result<void, { code: string; message: string }> = ok(undefined),
) {
  return (
    _storage: StoragePort,
    tabId: number,
  ): Promise<Result<BuiltLoop, BuildLoopServicesError>> =>
    Promise.resolve(
      ok({
        services: mockServices(servicesOverrides),
        executorContext: fakeExecutorContext(tabId),
        attach: () => Promise.resolve(attachResult as never),
        detach: () => Promise.resolve(ok(undefined) as never),
      }),
    );
}

function panelPorts(): {
  panelPort: MessagePortPanel;
  backgroundPort: MessagePortBackground;
} {
  const { a, b } = createFakePortPair<PanelToBackgroundMessage, BackgroundToPanelMessage>();
  return { panelPort: a, backgroundPort: b };
}

type MessagePortPanel = ReturnType<
  typeof createFakePortPair<PanelToBackgroundMessage, BackgroundToPanelMessage>
>['a'];
type MessagePortBackground = ReturnType<
  typeof createFakePortPair<PanelToBackgroundMessage, BackgroundToPanelMessage>
>['b'];

async function waitForMessage(
  received: BackgroundToPanelMessage[],
  predicate: (message: BackgroundToPanelMessage) => boolean,
): Promise<void> {
  const start = Date.now();
  while (!received.some(predicate)) {
    if (Date.now() - start > WAIT_TIMEOUT) {
      throw new Error('Timed out waiting for message');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('createRunManager', () => {
  it('sends RUN_IDLE immediately on registration when no run has started', () => {
    const manager = createRunManager(createMemoryStorage(), createMemoryStorage(), fakeBuildLoop());
    const { panelPort, backgroundPort } = panelPorts();
    const received: BackgroundToPanelMessage[] = [];
    panelPort.onMessage((message) => received.push(message));

    manager.registerPort(backgroundPort);

    expect(received).toEqual([{ type: 'RUN_IDLE' }]);
  });

  it('starts a run and broadcasts RUN_STATUS through to done', async () => {
    const manager = createRunManager(createMemoryStorage(), createMemoryStorage(), fakeBuildLoop());
    const { panelPort, backgroundPort } = panelPorts();
    const received: BackgroundToPanelMessage[] = [];
    panelPort.onMessage((message) => received.push(message));
    manager.registerPort(backgroundPort);

    panelPort.send({ type: 'START_RUN', task: 'Buy oat milk', tabId: 1 });

    await waitForMessage(received, (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'done');
  });

  it('rejects starting a second run while one is already active, without affecting the active one', async () => {
    const manager = createRunManager(
      createMemoryStorage(),
      createMemoryStorage(),
      fakeBuildLoop({
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- deliberately never resolves
        perceive: () => new Promise(() => {}),
      }),
    );
    const { panelPort, backgroundPort } = panelPorts();
    const received: BackgroundToPanelMessage[] = [];
    panelPort.onMessage((message) => received.push(message));
    manager.registerPort(backgroundPort);

    panelPort.send({ type: 'START_RUN', task: 'First task', tabId: 1 });
    await waitForMessage(
      received,
      (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'active',
    );

    panelPort.send({ type: 'START_RUN', task: 'Second task', tabId: 2 });
    await waitForMessage(received, (m) => m.type === 'RUN_START_FAILED');

    const failure = received.find((m) => m.type === 'RUN_START_FAILED');
    expect(failure).toEqual({ type: 'RUN_START_FAILED', reason: 'A run is already in progress' });
  });

  it('STOP_RUN stops an active run', async () => {
    const manager = createRunManager(
      createMemoryStorage(),
      createMemoryStorage(),
      fakeBuildLoop({
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- deliberately never resolves
        perceive: () => new Promise(() => {}),
      }),
    );
    const { panelPort, backgroundPort } = panelPorts();
    const received: BackgroundToPanelMessage[] = [];
    panelPort.onMessage((message) => received.push(message));
    manager.registerPort(backgroundPort);

    panelPort.send({ type: 'START_RUN', task: 'Buy oat milk', tabId: 1 });
    await waitForMessage(
      received,
      (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'active',
    );

    panelPort.send({ type: 'STOP_RUN' });
    await waitForMessage(
      received,
      (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'stopped',
    );
  });

  it('broadcasts to every registered port', async () => {
    const manager = createRunManager(createMemoryStorage(), createMemoryStorage(), fakeBuildLoop());
    const { panelPort: panelPortA, backgroundPort: backgroundPortA } = panelPorts();
    const { panelPort: panelPortB, backgroundPort: backgroundPortB } = panelPorts();
    const receivedA: BackgroundToPanelMessage[] = [];
    const receivedB: BackgroundToPanelMessage[] = [];
    panelPortA.onMessage((message) => receivedA.push(message));
    panelPortB.onMessage((message) => receivedB.push(message));
    manager.registerPort(backgroundPortA);
    manager.registerPort(backgroundPortB);

    panelPortA.send({ type: 'START_RUN', task: 'Buy oat milk', tabId: 1 });

    await waitForMessage(receivedA, (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'done');
    await waitForMessage(receivedB, (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'done');
  });

  it('stops broadcasting to a port after it disconnects', async () => {
    const manager = createRunManager(createMemoryStorage(), createMemoryStorage(), fakeBuildLoop());
    const { panelPort, backgroundPort } = panelPorts();
    const received: BackgroundToPanelMessage[] = [];
    panelPort.onMessage((message) => received.push(message));
    manager.registerPort(backgroundPort);

    panelPort.disconnect();
    received.length = 0;

    panelPort.send({ type: 'START_RUN', task: 'Buy oat milk', tabId: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).toEqual([]);
  });

  it('reports RUN_START_FAILED when the composition root cannot be built', async () => {
    const buildLoop = (): Promise<Result<BuiltLoop, BuildLoopServicesError>> =>
      Promise.resolve({
        ok: false as const,
        error: {
          code: 'MODEL_ROUTING_NOT_CONFIGURED',
          message: 'No model routing is configured yet',
        },
      });
    const manager = createRunManager(createMemoryStorage(), createMemoryStorage(), buildLoop);
    const { panelPort, backgroundPort } = panelPorts();
    const received: BackgroundToPanelMessage[] = [];
    panelPort.onMessage((message) => received.push(message));
    manager.registerPort(backgroundPort);

    panelPort.send({ type: 'START_RUN', task: 'Buy oat milk', tabId: 1 });
    await waitForMessage(received, (m) => m.type === 'RUN_START_FAILED');

    expect(received).toContainEqual({
      type: 'RUN_START_FAILED',
      reason: 'No model routing is configured yet',
    });
  });

  it('reports RUN_START_FAILED when attaching the CDP session fails', async () => {
    const manager = createRunManager(
      createMemoryStorage(),
      createMemoryStorage(),
      fakeBuildLoop({}, { ok: false, error: { code: 'CDP_ATTACH_FAILED', message: 'tab closed' } }),
    );
    const { panelPort, backgroundPort } = panelPorts();
    const received: BackgroundToPanelMessage[] = [];
    panelPort.onMessage((message) => received.push(message));
    manager.registerPort(backgroundPort);

    panelPort.send({ type: 'START_RUN', task: 'Buy oat milk', tabId: 1 });
    await waitForMessage(received, (m) => m.type === 'RUN_START_FAILED');

    expect(received).toContainEqual({
      type: 'RUN_START_FAILED',
      reason: 'Could not attach to the page: tab closed',
    });
  });

  describe('initialize', () => {
    it('does nothing when no snapshot is persisted', async () => {
      const manager = createRunManager(
        createMemoryStorage(),
        createMemoryStorage(),
        fakeBuildLoop(),
      );
      await expect(manager.initialize()).resolves.toBeUndefined();
    });

    it('clears an already-terminal persisted snapshot instead of resuming it', async () => {
      const storage = createMemoryStorage();
      const machine = createAgentLoopMachine(mockServices(), fakeExecutorContext(1));
      const actor = createActor(machine, { input: { task: 'Buy oat milk', tabId: 1 } });
      const stopPersisting = persistAgentLoopOnTransition(actor, storage);
      actor.start();
      await waitFor(actor, (s) => s.status === 'done', { timeout: WAIT_TIMEOUT });
      stopPersisting();

      const manager = createRunManager(storage, createMemoryStorage(), fakeBuildLoop());
      await manager.initialize();

      const hydrated = await hydrateAgentLoopSnapshot(storage);
      expect(hydrated.ok && hydrated.value).toBeUndefined();
    });

    it('resumes an active persisted snapshot and it can still be stopped', async () => {
      const storage = createMemoryStorage();
      const services = mockServices({
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- deliberately never resolves
        perceive: () => new Promise(() => {}),
      });
      const machine = createAgentLoopMachine(services, fakeExecutorContext(1));
      const actor = createActor(machine, { input: { task: 'Buy oat milk', tabId: 1 } });
      const stopPersisting = persistAgentLoopOnTransition(actor, storage);
      actor.start();
      await waitFor(actor, (s) => s.value === 'perceiving', { timeout: WAIT_TIMEOUT });
      stopPersisting();
      actor.stop();

      const manager = createRunManager(
        storage,
        createMemoryStorage(),
        fakeBuildLoop({ perceive: services.perceive }),
      );
      await manager.initialize();

      const { panelPort, backgroundPort } = panelPorts();
      const received: BackgroundToPanelMessage[] = [];
      panelPort.onMessage((message) => received.push(message));
      manager.registerPort(backgroundPort);

      expect(received).toEqual([
        { type: 'RUN_STATUS', summary: expect.objectContaining({ outcome: 'active' }) },
      ]);

      panelPort.send({ type: 'STOP_RUN' });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'stopped',
      );
    });
  });
});

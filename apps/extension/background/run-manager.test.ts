import {
  createDefaultToolRegistry,
  createFakeTabManager,
  type ExecutorContext,
} from '@aegis/actions';
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
        toolRegistry: createDefaultToolRegistry(),
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

    expect(received).toEqual([{ type: 'RUN_IDLE' }, { type: 'TRACE_SNAPSHOT', steps: [] }]);
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

  describe('confirmation gate', () => {
    it('surfaces pendingConfirmation on RUN_STATUS while a run awaits a decision', async () => {
      const manager = createRunManager(
        createMemoryStorage(),
        createMemoryStorage(),
        fakeBuildLoop({ checkPolicy: () => Promise.resolve(ok({ decision: 'confirm' })) }),
      );
      const { panelPort, backgroundPort } = panelPorts();
      const received: BackgroundToPanelMessage[] = [];
      panelPort.onMessage((message) => received.push(message));
      manager.registerPort(backgroundPort);

      panelPort.send({ type: 'START_RUN', task: 'Delete account', tabId: 1 });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.pendingConfirmation !== undefined,
      );

      const withConfirmation = received.find(
        (m) => m.type === 'RUN_STATUS' && m.summary.pendingConfirmation !== undefined,
      );
      expect(
        withConfirmation?.type === 'RUN_STATUS' &&
          withConfirmation.summary.pendingConfirmation?.preview,
      ).toEqual(['Click "ax:1"']);
    });

    it('APPROVE_RUN resolves the confirmation and lets the run finish', async () => {
      const manager = createRunManager(
        createMemoryStorage(),
        createMemoryStorage(),
        fakeBuildLoop({ checkPolicy: () => Promise.resolve(ok({ decision: 'confirm' })) }),
      );
      const { panelPort, backgroundPort } = panelPorts();
      const received: BackgroundToPanelMessage[] = [];
      panelPort.onMessage((message) => received.push(message));
      manager.registerPort(backgroundPort);

      panelPort.send({ type: 'START_RUN', task: 'Delete account', tabId: 1 });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.pendingConfirmation !== undefined,
      );

      panelPort.send({ type: 'APPROVE_RUN' });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'done',
      );
    });

    it('REJECT_RUN resolves the confirmation and replans instead of executing', async () => {
      let planCalls = 0;
      const manager = createRunManager(
        createMemoryStorage(),
        createMemoryStorage(),
        fakeBuildLoop({
          checkPolicy: () => Promise.resolve(ok({ decision: 'confirm' })),
          plan: () => {
            planCalls += 1;
            return Promise.resolve(
              ok({ subGoal: `attempt ${planCalls}`, taskComplete: planCalls > 1 }),
            );
          },
        }),
      );
      const { panelPort, backgroundPort } = panelPorts();
      const received: BackgroundToPanelMessage[] = [];
      panelPort.onMessage((message) => received.push(message));
      manager.registerPort(backgroundPort);

      panelPort.send({ type: 'START_RUN', task: 'Delete account', tabId: 1 });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.pendingConfirmation !== undefined,
      );

      panelPort.send({ type: 'REJECT_RUN' });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'done',
      );

      expect(planCalls).toBe(2);
    });

    it('EDIT_RUN revises the pending actions, and the run can still be approved afterward', async () => {
      const manager = createRunManager(
        createMemoryStorage(),
        createMemoryStorage(),
        fakeBuildLoop({ checkPolicy: () => Promise.resolve(ok({ decision: 'confirm' })) }),
      );
      const { panelPort, backgroundPort } = panelPorts();
      const received: BackgroundToPanelMessage[] = [];
      panelPort.onMessage((message) => received.push(message));
      manager.registerPort(backgroundPort);

      panelPort.send({ type: 'START_RUN', task: 'Delete account', tabId: 1 });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.pendingConfirmation !== undefined,
      );

      const editedActions = [
        { type: 'input_text' as const, ref: toElementRef('ax:2'), text: 'ok' },
      ];
      panelPort.send({ type: 'EDIT_RUN', actions: editedActions });
      await waitForMessage(
        received,
        (m) =>
          m.type === 'RUN_STATUS' &&
          m.summary.pendingConfirmation?.preview[0] === 'Enter "ok" into "ax:2"',
      );

      panelPort.send({ type: 'APPROVE_RUN' });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'done',
      );
    });
  });

  describe('trace', () => {
    it('broadcasts a TRACE_STEP after each verify resolves, with reasoning and action results', async () => {
      const manager = createRunManager(
        createMemoryStorage(),
        createMemoryStorage(),
        fakeBuildLoop({
          plan: () =>
            Promise.resolve(
              ok({
                subGoal: 'find the item',
                taskComplete: false,
                reasoning: 'user wants oat milk',
              }),
            ),
          decide: () =>
            Promise.resolve(
              ok({
                actions: [{ type: 'click', ref: toElementRef('ax:1') }],
                stuck: false,
                reasoning: 'clicking the search result',
              }),
            ),
          act: () =>
            Promise.resolve({
              kind: 'completed',
              results: [
                {
                  toolCall: {
                    toolId: 'browser.click',
                    args: { type: 'click', ref: toElementRef('ax:1') },
                  },
                  attempt: 1,
                  outcome: { ok: true, value: { kind: 'click' } },
                },
              ],
            }),
          verify: () =>
            Promise.resolve(
              ok({ outcome: 'achieved', taskComplete: true, reasoning: 'cart shows the item' }),
            ),
        }),
      );
      const { panelPort, backgroundPort } = panelPorts();
      const received: BackgroundToPanelMessage[] = [];
      panelPort.onMessage((message) => received.push(message));
      manager.registerPort(backgroundPort);

      panelPort.send({ type: 'START_RUN', task: 'Buy oat milk', tabId: 1 });
      await waitForMessage(received, (m) => m.type === 'TRACE_STEP');

      const traceStep = received.find((m) => m.type === 'TRACE_STEP');
      expect(traceStep).toEqual({
        type: 'TRACE_STEP',
        step: {
          stepNumber: 1,
          subGoal: 'find the item',
          plannerReasoning: 'user wants oat milk',
          navigatorReasoning: 'clicking the search result',
          actions: [
            {
              toolId: 'browser.click',
              source: 'browser',
              description: 'Click "ax:1"',
              argsSummary: JSON.stringify({ type: 'click', ref: toElementRef('ax:1') }),
              succeeded: true,
              errorMessage: undefined,
            },
          ],
          policyDecision: 'allow',
          verifyOutcome: 'achieved',
          verifierReasoning: 'cart shows the item',
          perception: perceptionFixture(),
        },
      });
    });

    it('accumulates multiple steps across replans, in order', async () => {
      let verifyCalls = 0;
      const manager = createRunManager(
        createMemoryStorage(),
        createMemoryStorage(),
        fakeBuildLoop({
          verify: () => {
            verifyCalls += 1;
            return Promise.resolve(
              ok({
                outcome: verifyCalls > 1 ? 'achieved' : 'continue',
                taskComplete: verifyCalls > 1,
              }),
            );
          },
        }),
      );
      const { panelPort, backgroundPort } = panelPorts();
      const received: BackgroundToPanelMessage[] = [];
      panelPort.onMessage((message) => received.push(message));
      manager.registerPort(backgroundPort);

      panelPort.send({ type: 'START_RUN', task: 'Buy oat milk', tabId: 1 });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'done',
      );

      const steps = received.filter((m) => m.type === 'TRACE_STEP');
      expect(steps.map((m) => m.step.stepNumber)).toEqual([1, 2]);
    });

    it('sends the accumulated trace as a TRACE_SNAPSHOT to a port that connects mid-run', async () => {
      const manager = createRunManager(
        createMemoryStorage(),
        createMemoryStorage(),
        fakeBuildLoop(),
      );
      const { panelPort: firstPanel, backgroundPort: firstBackground } = panelPorts();
      manager.registerPort(firstBackground);

      const firstReceived: BackgroundToPanelMessage[] = [];
      firstPanel.onMessage((message) => firstReceived.push(message));
      firstPanel.send({ type: 'START_RUN', task: 'Buy oat milk', tabId: 1 });
      await waitForMessage(firstReceived, (m) => m.type === 'TRACE_STEP');

      const { panelPort: latePanel, backgroundPort: lateBackground } = panelPorts();
      const lateReceived: BackgroundToPanelMessage[] = [];
      latePanel.onMessage((message) => lateReceived.push(message));
      manager.registerPort(lateBackground);

      const snapshot = lateReceived.find((m) => m.type === 'TRACE_SNAPSHOT');
      expect(snapshot?.type).toBe('TRACE_SNAPSHOT');
      expect(snapshot?.type === 'TRACE_SNAPSHOT' && snapshot.steps).toHaveLength(1);
    });

    it('resets the trace when a new run starts', async () => {
      const manager = createRunManager(
        createMemoryStorage(),
        createMemoryStorage(),
        fakeBuildLoop(),
      );
      const { panelPort, backgroundPort } = panelPorts();
      const received: BackgroundToPanelMessage[] = [];
      panelPort.onMessage((message) => received.push(message));
      manager.registerPort(backgroundPort);

      panelPort.send({ type: 'START_RUN', task: 'First task', tabId: 1 });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'done',
      );

      received.length = 0;
      panelPort.send({ type: 'START_RUN', task: 'Second task', tabId: 1 });
      await waitForMessage(received, (m) => m.type === 'TRACE_SNAPSHOT');

      const resetSnapshot = received.find((m) => m.type === 'TRACE_SNAPSHOT');
      expect(resetSnapshot?.type === 'TRACE_SNAPSHOT' && resetSnapshot.steps).toEqual([]);
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
        { type: 'TRACE_SNAPSHOT', steps: [] },
      ]);

      panelPort.send({ type: 'STOP_RUN' });
      await waitForMessage(
        received,
        (m) => m.type === 'RUN_STATUS' && m.summary.outcome === 'stopped',
      );
    });
  });
});

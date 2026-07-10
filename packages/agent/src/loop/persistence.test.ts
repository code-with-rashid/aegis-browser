import {
  createDefaultToolRegistry,
  createFakeTabManager,
  type ExecutorContext,
} from '@aegis/actions';
import { createFakeCdp, type PerceptionPayload } from '@aegis/perception';
import { createMemoryStorage, isOk, ok } from '@aegis/shared';
import { createActor, waitFor, type Snapshot } from 'xstate';
import { describe, expect, it } from 'vitest';

import { createAgentLoopMachine } from './machine';
import {
  clearAgentLoopSnapshot,
  hydrateAgentLoopSnapshot,
  persistAgentLoopOnTransition,
} from './persistence';
import type { LoopServices } from './services';

const WAIT_TIMEOUT = 1000;

function perceptionFixture(): PerceptionPayload {
  return {
    elements: [],
    content: { text: '', truncated: false },
    tokenEstimate: 0,
    truncated: false,
  };
}

function testExecutorContext(): ExecutorContext {
  return { session: createFakeCdp(1), tabManager: createFakeTabManager(1) };
}

function mockServices(overrides: Partial<LoopServices> = {}): LoopServices {
  return {
    perceive: () => Promise.resolve(ok(perceptionFixture())),
    plan: () => Promise.resolve(ok({ subGoal: 'do the thing', taskComplete: false })),
    decide: () => Promise.resolve(ok({ actions: [], stuck: false })),
    checkPolicy: () => Promise.resolve(ok({ decision: 'confirm' })),
    checkAlignment: () => Promise.resolve(ok({ aligned: true, reasoning: 'consistent with task' })),
    act: () => Promise.resolve({ kind: 'completed', results: [] }),
    verify: () => Promise.resolve(ok({ outcome: 'achieved', taskComplete: true })),
    ...overrides,
  };
}

describe('agent loop persistence', () => {
  it('has nothing persisted before any run', async () => {
    const storage = createMemoryStorage();
    const result = await hydrateAgentLoopSnapshot(storage);
    expect(isOk(result) && result.value).toBeUndefined();
  });

  it('persists a snapshot on every transition, hydratable into a fresh actor', async () => {
    const storage = createMemoryStorage();
    const services = mockServices();
    const machine = createAgentLoopMachine(
      services,
      testExecutorContext(),
      createDefaultToolRegistry(),
    );
    const actor = createActor(machine, { input: { task: 'Delete account', tabId: 1 } });

    const stopPersisting = persistAgentLoopOnTransition(actor, storage);
    actor.start();

    await waitFor(actor, (s) => s.value === 'confirming', { timeout: WAIT_TIMEOUT });
    stopPersisting();
    actor.stop();

    const hydrated = await hydrateAgentLoopSnapshot(storage);
    if (!isOk(hydrated) || hydrated.value === undefined) {
      throw new Error('expected a persisted snapshot');
    }

    const rehydratedMachine = createAgentLoopMachine(
      services,
      testExecutorContext(),
      createDefaultToolRegistry(),
    );
    const rehydratedActor = createActor(rehydratedMachine, {
      input: { task: 'Delete account', tabId: 1 },
      snapshot: hydrated.value as Snapshot<unknown>,
    });
    rehydratedActor.start();

    expect(rehydratedActor.getSnapshot().value).toBe('confirming');

    rehydratedActor.send({ type: 'APPROVE' });
    const finalSnapshot = await waitFor(rehydratedActor, (s) => s.status === 'done', {
      timeout: WAIT_TIMEOUT,
    });
    expect(finalSnapshot.value).toBe('done');
  });

  it('clearAgentLoopSnapshot removes the persisted snapshot', async () => {
    const storage = createMemoryStorage();
    const services = mockServices();
    const machine = createAgentLoopMachine(
      services,
      testExecutorContext(),
      createDefaultToolRegistry(),
    );
    const actor = createActor(machine, { input: { task: 'Delete account', tabId: 1 } });

    const stopPersisting = persistAgentLoopOnTransition(actor, storage);
    actor.start();
    await waitFor(actor, (s) => s.value === 'confirming', { timeout: WAIT_TIMEOUT });
    stopPersisting();

    await clearAgentLoopSnapshot(storage);

    const hydrated = await hydrateAgentLoopSnapshot(storage);
    expect(isOk(hydrated) && hydrated.value).toBeUndefined();
  });
});

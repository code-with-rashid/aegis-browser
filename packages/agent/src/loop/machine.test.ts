import { createFakeTabManager, type ExecutorContext } from '@aegis/actions';
import { createFakeCdp, type PerceptionPayload } from '@aegis/perception';
import { err, ok, toElementRef } from '@aegis/shared';
import { createActor, waitFor } from 'xstate';
import { describe, expect, it } from 'vitest';

import { AgentError } from './errors';
import { createAgentLoopMachine } from './machine';
import type { LoopServices } from './services';
import { summarizeLoopRun } from './summary';

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
    decide: () =>
      Promise.resolve(
        ok({ actions: [{ type: 'click', ref: toElementRef('ax:1') }], stuck: false }),
      ),
    checkPolicy: () => Promise.resolve(ok({ decision: 'allow' })),
    act: () => Promise.resolve({ kind: 'completed', results: [] }),
    verify: () => Promise.resolve(ok({ outcome: 'achieved', taskComplete: true })),
    ...overrides,
  };
}

function isFinalized(snapshot: { status: string }): boolean {
  return snapshot.status === 'done';
}

describe('agent loop machine', () => {
  it('completes the happy path: planning -> perceiving -> deciding -> policyCheck -> acting -> verifying -> done', async () => {
    const machine = createAgentLoopMachine(mockServices(), testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Buy milk', tabId: 1 } });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('done');
    expect(snapshot.context.taskSummary).toBeUndefined();
  });

  it('finishes immediately when the planner reports the task already complete', async () => {
    const services = mockServices({
      plan: () =>
        Promise.resolve(ok({ subGoal: 'n/a', taskComplete: true, summary: 'Already done' })),
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Buy milk', tabId: 1 } });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('done');
    expect(snapshot.context.taskSummary).toBe('Already done');
  });

  it('routes a state-changing action through confirming, and APPROVE resumes to acting', async () => {
    const services = mockServices({
      checkPolicy: () => Promise.resolve(ok({ decision: 'confirm' })),
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Delete account', tabId: 1 } });
    actor.start();

    const confirmingSnapshot = await waitFor(actor, (s) => s.value === 'confirming', {
      timeout: WAIT_TIMEOUT,
    });
    expect(confirmingSnapshot.value).toBe('confirming');
    expect(confirmingSnapshot.context.pendingConfirmation?.actions).toEqual([
      { type: 'click', ref: toElementRef('ax:1') },
    ]);
    expect(confirmingSnapshot.context.pendingConfirmation?.preview).toEqual(['Click "ax:1"']);

    actor.send({ type: 'APPROVE' });
    const finalSnapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(finalSnapshot.value).toBe('done');
    expect(finalSnapshot.context.pendingConfirmation).toBeUndefined();
  });

  it("includes the policy engine's reason in the confirmation request", async () => {
    const services = mockServices({
      checkPolicy: () =>
        Promise.resolve(ok({ decision: 'confirm', reason: 'Submit Order is state-changing' })),
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Buy milk', tabId: 1 } });
    actor.start();

    const snapshot = await waitFor(actor, (s) => s.value === 'confirming', {
      timeout: WAIT_TIMEOUT,
    });
    expect(snapshot.context.pendingConfirmation?.reason).toBe('Submit Order is state-changing');
  });

  it('lets EDIT revise the pending actions while still awaiting a decision', async () => {
    const services = mockServices({
      checkPolicy: () => Promise.resolve(ok({ decision: 'confirm' })),
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Delete account', tabId: 1 } });
    actor.start();

    await waitFor(actor, (s) => s.value === 'confirming', { timeout: WAIT_TIMEOUT });

    const editedActions = [{ type: 'input_text' as const, ref: toElementRef('ax:2'), text: 'ok' }];
    actor.send({ type: 'EDIT', actions: editedActions });

    const edited = actor.getSnapshot();
    expect(edited.value).toBe('confirming');
    expect(edited.context.proposedActions).toEqual(editedActions);
    expect(edited.context.pendingConfirmation?.preview).toEqual(['Enter "ok" into "ax:2"']);

    actor.send({ type: 'APPROVE' });
    const finalSnapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });
    expect(finalSnapshot.value).toBe('done');
  });

  it('routes REJECT from confirming back through replanning to planning', async () => {
    let planCalls = 0;
    const services = mockServices({
      checkPolicy: () => Promise.resolve(ok({ decision: 'confirm' })),
      plan: () => {
        planCalls += 1;
        return Promise.resolve(
          ok({ subGoal: `attempt ${planCalls}`, taskComplete: planCalls > 1 }),
        );
      },
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Delete account', tabId: 1 } });
    actor.start();

    await waitFor(actor, (s) => s.value === 'confirming', { timeout: WAIT_TIMEOUT });
    actor.send({ type: 'REJECT' });

    const finalSnapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(finalSnapshot.value).toBe('done');
    expect(planCalls).toBe(2);
  });

  it('routes a denied action through replanning without ever asking a human', async () => {
    let planCalls = 0;
    const services = mockServices({
      checkPolicy: () =>
        Promise.resolve(ok({ decision: 'deny', reason: 'chase.com is hard deny-listed' })),
      plan: () => {
        planCalls += 1;
        return Promise.resolve(
          ok({ subGoal: `attempt ${planCalls}`, taskComplete: planCalls > 1 }),
        );
      },
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Check my bank balance', tabId: 1 } });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('done');
    expect(planCalls).toBe(2);
    expect(snapshot.context.lastError).toEqual({
      code: 'POLICY_DENIED',
      message: 'chase.com is hard deny-listed',
    });
  });

  it('replans when the navigator reports being stuck', async () => {
    let decideCalls = 0;
    const services = mockServices({
      decide: () => {
        decideCalls += 1;
        return Promise.resolve(ok({ actions: [], stuck: decideCalls === 1 }));
      },
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Find the button', tabId: 1 } });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('done');
    expect(decideCalls).toBe(2);
  });

  it('replans when acting reports a stall', async () => {
    let actCalls = 0;
    const services = mockServices({
      act: () => {
        actCalls += 1;
        return Promise.resolve(
          actCalls === 1
            ? { kind: 'stalled', results: [], stalledOn: { type: 'wait', ms: 1 } }
            : { kind: 'completed', results: [] },
        );
      },
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Click forever', tabId: 1 } });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('done');
    expect(actCalls).toBe(2);
  });

  it('fails when acting exhausts retries', async () => {
    const services = mockServices({
      act: () =>
        Promise.resolve({
          kind: 'failed',
          results: [],
          failedAction: { type: 'navigate', url: 'https://example.com' },
        }),
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Go somewhere', tabId: 1 } });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('failed');
    expect(snapshot.context.lastError?.code).toBe('ACTION_RUN_FAILED');
  });

  it('replans when the verifier reports the sub-goal attempt failed', async () => {
    let verifyCalls = 0;
    let planCalls = 0;
    const services = mockServices({
      plan: () => {
        planCalls += 1;
        return Promise.resolve(
          ok({ subGoal: `attempt ${planCalls}`, taskComplete: planCalls > 1 }),
        );
      },
      verify: () => {
        verifyCalls += 1;
        return Promise.resolve(ok({ outcome: 'failed', taskComplete: false }));
      },
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Dead-end task', tabId: 1 } });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('done');
    expect(verifyCalls).toBe(1);
    expect(planCalls).toBe(2);
  });

  it('fails when a service reports an error', async () => {
    const services = mockServices({
      decide: () =>
        Promise.resolve(err(new AgentError('NAVIGATOR_FAILED', 'model returned garbage'))),
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Confuse the navigator', tabId: 1 } });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('failed');
    expect(snapshot.context.lastError).toEqual({
      code: 'NAVIGATOR_FAILED',
      message: 'model returned garbage',
    });
  });

  it('continues perceiving again when a sub-goal is not yet complete', async () => {
    let verifyCalls = 0;
    const services = mockServices({
      verify: () => {
        verifyCalls += 1;
        return Promise.resolve(
          ok({ outcome: verifyCalls > 1 ? 'achieved' : 'continue', taskComplete: verifyCalls > 1 }),
        );
      },
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Multi-step task', tabId: 1 } });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('done');
    expect(verifyCalls).toBe(2);
  });

  it('pauses on PAUSE during perceiving, and RESUME goes back to perceiving', async () => {
    let perceiveCalls = 0;
    const services = mockServices({
      perceive: () => {
        perceiveCalls += 1;
        // The first call never resolves, so the actor reliably stays in "perceiving"
        // until the test sends PAUSE — invoked actors are torn down on state exit, so
        // this never-resolving promise is simply discarded once we leave the state.
        if (perceiveCalls === 1) {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- deliberately never resolves
          return new Promise<never>(() => {});
        }
        return Promise.resolve(ok(perceptionFixture()));
      },
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Buy milk', tabId: 1 } });
    actor.start();

    await waitFor(actor, (s) => s.value === 'perceiving', { timeout: WAIT_TIMEOUT });
    actor.send({ type: 'PAUSE' });
    const pausedSnapshot = await waitFor(actor, (s) => s.value === 'paused', {
      timeout: WAIT_TIMEOUT,
    });
    expect(pausedSnapshot.value).toBe('paused');

    actor.send({ type: 'RESUME' });
    const finalSnapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });
    expect(finalSnapshot.value).toBe('done');
    expect(perceiveCalls).toBe(2);
  });

  it('stops immediately on STOP, reaching the stopped final state', async () => {
    const machine = createAgentLoopMachine(mockServices(), testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Buy milk', tabId: 1 } });
    actor.start();

    actor.send({ type: 'STOP' });
    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('stopped');
  });

  it('resumes correctly after being killed and rehydrated mid-run', async () => {
    const services = mockServices({
      checkPolicy: () => Promise.resolve(ok({ decision: 'confirm' })),
    });
    const firstMachine = createAgentLoopMachine(services, testExecutorContext());
    const firstActor = createActor(firstMachine, { input: { task: 'Delete account', tabId: 1 } });
    firstActor.start();

    await waitFor(firstActor, (s) => s.value === 'confirming', { timeout: WAIT_TIMEOUT });
    const persistedSnapshot = firstActor.getPersistedSnapshot();
    firstActor.stop(); // simulate the service worker being killed mid-task

    // A fresh machine instance (a real restart re-wires services/executor context too).
    const secondMachine = createAgentLoopMachine(services, testExecutorContext());
    const secondActor = createActor(secondMachine, {
      input: { task: 'Delete account', tabId: 1 },
      snapshot: persistedSnapshot,
    });
    secondActor.start();

    expect(secondActor.getSnapshot().value).toBe('confirming');

    secondActor.send({ type: 'APPROVE' });
    const finalSnapshot = await waitFor(secondActor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(finalSnapshot.value).toBe('done');
  });

  it('fails with MAX_STEPS_EXCEEDED rather than looping forever', async () => {
    let actCalls = 0;
    const services = mockServices({
      act: () => {
        actCalls += 1;
        return Promise.resolve({ kind: 'completed', results: [] });
      },
      // Never reports the sub-goal achieved, so without a step budget this would loop forever.
      verify: () => Promise.resolve(ok({ outcome: 'continue', taskComplete: false })),
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, {
      input: { task: 'Never-ending task', tabId: 1, maxSteps: 3 },
    });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('failed');
    expect(snapshot.context.lastError?.code).toBe('MAX_STEPS_EXCEEDED');
    expect(actCalls).toBe(3);
  });

  it('fails with MAX_REPLANS_EXCEEDED rather than looping forever', async () => {
    let decideCalls = 0;
    const services = mockServices({
      // Always stuck, so without a replan budget this would loop forever.
      decide: () => {
        decideCalls += 1;
        return Promise.resolve(ok({ actions: [], stuck: true }));
      },
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, {
      input: { task: 'Always stuck', tabId: 1, maxReplans: 3 },
    });
    actor.start();

    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('failed');
    expect(snapshot.context.lastError?.code).toBe('MAX_REPLANS_EXCEEDED');
    // the initial decide + one per replan attempt before the budget check kicks in
    expect(decideCalls).toBe(4);
  });

  it('aborts the signal passed to a service when STOP exits its state mid-invoke', async () => {
    let capturedSignal: AbortSignal | undefined;
    const services = mockServices({
      act: (_actions, _context, signal) => {
        capturedSignal = signal;
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- deliberately never resolves
        return new Promise(() => {});
      },
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Buy milk', tabId: 1 } });
    actor.start();

    await waitFor(actor, (s) => s.value === 'acting', { timeout: WAIT_TIMEOUT });
    expect(capturedSignal?.aborted).toBe(false);

    actor.send({ type: 'STOP' });
    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('stopped');
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('halts within one step when STOP arrives during a slow perceive call', async () => {
    const services = mockServices({
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- deliberately never resolves
      perceive: () => new Promise(() => {}),
    });
    const machine = createAgentLoopMachine(services, testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Buy milk', tabId: 1 } });
    actor.start();

    await waitFor(actor, (s) => s.value === 'perceiving', { timeout: WAIT_TIMEOUT });
    actor.send({ type: 'STOP' });
    const snapshot = await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });

    expect(snapshot.value).toBe('stopped');
  });

  it('produces a graceful termination summary from a real actor snapshot', async () => {
    const machine = createAgentLoopMachine(mockServices(), testExecutorContext());
    const actor = createActor(machine, { input: { task: 'Buy milk', tabId: 1 } });
    actor.start();

    await waitFor(actor, isFinalized, { timeout: WAIT_TIMEOUT });
    const summary = summarizeLoopRun(actor.getSnapshot());

    expect(summary.outcome).toBe('done');
    expect(summary.task).toBe('Buy milk');
    expect(summary.stepCount).toBe(1);
    expect(summary.subGoalHistory).toEqual(['do the thing']);
  });
});

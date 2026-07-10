import type { ConfirmationRequest, TraceStep } from '@aegis/agent';
import { toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createFakePortPair } from '../../messaging/fake-port';
import type { BackgroundToPanelMessage, PanelToBackgroundMessage } from '../../messaging/protocol';
import { createRunStore } from './run-store';

function panelAndBackgroundPorts() {
  return createFakePortPair<PanelToBackgroundMessage, BackgroundToPanelMessage>();
}

function confirmationFixture(overrides: Partial<ConfirmationRequest> = {}): ConfirmationRequest {
  return {
    actions: [{ type: 'click', ref: toElementRef('ax:1') }],
    preview: ['Click "Submit Order"'],
    reason: 'submit order is state-changing',
    ...overrides,
  };
}

function traceStepFixture(overrides: Partial<TraceStep> = {}): TraceStep {
  return {
    stepNumber: 1,
    subGoal: 'Add to cart',
    plannerReasoning: 'user wants oat milk',
    navigatorReasoning: 'clicking add to cart',
    actions: [
      {
        toolId: 'browser.click',
        source: 'browser',
        description: 'Click "Add to cart"',
        argsSummary: JSON.stringify({ type: 'click', ref: toElementRef('ax:1') }),
        succeeded: true,
        errorMessage: undefined,
      },
    ],
    policyDecision: 'allow',
    verifyOutcome: 'achieved',
    verifierReasoning: 'cart now shows the item',
    perception: undefined,
    ...overrides,
  };
}

describe('createRunStore', () => {
  it('starts idle with an empty task', () => {
    const { a: panelPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);

    expect(store.getState().status).toBe('idle');
    expect(store.getState().task).toBe('');
  });

  it('setTask updates the task field', () => {
    const { a: panelPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);

    store.getState().setTask('Buy oat milk');

    expect(store.getState().task).toBe('Buy oat milk');
  });

  it('startRun sends START_RUN with the current task and given tabId', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);
    const received: PanelToBackgroundMessage[] = [];
    backgroundPort.onMessage((message) => received.push(message));

    store.getState().setTask('Buy oat milk');
    store.getState().startRun(7);

    expect(received).toEqual([{ type: 'START_RUN', task: 'Buy oat milk', tabId: 7 }]);
  });

  it('stopRun/pauseRun/resumeRun send the matching message', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);
    const received: PanelToBackgroundMessage[] = [];
    backgroundPort.onMessage((message) => received.push(message));

    store.getState().stopRun();
    store.getState().pauseRun();
    store.getState().resumeRun();

    expect(received).toEqual([{ type: 'STOP_RUN' }, { type: 'PAUSE_RUN' }, { type: 'RESUME_RUN' }]);
  });

  it('a RUN_STATUS message updates status, task, and counters from the summary', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);

    backgroundPort.send({
      type: 'RUN_STATUS',
      summary: {
        outcome: 'active',
        task: 'Buy oat milk',
        stepCount: 3,
        replanCount: 1,
        subGoalHistory: ['search', 'add to cart'],
      },
    });

    const state = store.getState();
    expect(state.status).toBe('active');
    expect(state.task).toBe('Buy oat milk');
    expect(state.stepCount).toBe(3);
    expect(state.replanCount).toBe(1);
  });

  it('a RUN_STATUS message with a lastError surfaces it', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);

    backgroundPort.send({
      type: 'RUN_STATUS',
      summary: {
        outcome: 'failed',
        task: 'Buy oat milk',
        stepCount: 3,
        replanCount: 1,
        subGoalHistory: [],
        lastError: { code: 'MAX_STEPS_EXCEEDED', message: 'too many steps' },
      },
    });

    expect(store.getState().lastError).toEqual({
      code: 'MAX_STEPS_EXCEEDED',
      message: 'too many steps',
    });
  });

  it('a RUN_IDLE message resets the run fields', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);

    backgroundPort.send({
      type: 'RUN_STATUS',
      summary: {
        outcome: 'done',
        task: 'Buy oat milk',
        stepCount: 5,
        replanCount: 0,
        subGoalHistory: [],
      },
    });
    backgroundPort.send({ type: 'RUN_IDLE' });

    const state = store.getState();
    expect(state.status).toBe('idle');
    expect(state.stepCount).toBe(0);
  });

  it('a RUN_START_FAILED message surfaces the reason without touching run status', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);

    backgroundPort.send({ type: 'RUN_START_FAILED', reason: 'A run is already in progress' });

    expect(store.getState().startFailedReason).toBe('A run is already in progress');
    expect(store.getState().status).toBe('idle');
  });

  it('a subsequent RUN_STATUS clears a previous start-failed reason', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);

    backgroundPort.send({ type: 'RUN_START_FAILED', reason: 'A run is already in progress' });
    backgroundPort.send({
      type: 'RUN_STATUS',
      summary: {
        outcome: 'active',
        task: 'Buy oat milk',
        stepCount: 1,
        replanCount: 0,
        subGoalHistory: [],
      },
    });

    expect(store.getState().startFailedReason).toBeUndefined();
  });

  it('starts with an empty trace', () => {
    const { a: panelPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);
    expect(store.getState().trace).toEqual([]);
  });

  it('a TRACE_SNAPSHOT replaces the trace wholesale', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);
    const steps = [traceStepFixture({ stepNumber: 1 }), traceStepFixture({ stepNumber: 2 })];

    backgroundPort.send({ type: 'TRACE_SNAPSHOT', steps });

    expect(store.getState().trace).toEqual(steps);
  });

  it('a TRACE_STEP appends to the existing trace', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);

    backgroundPort.send({ type: 'TRACE_SNAPSHOT', steps: [traceStepFixture({ stepNumber: 1 })] });
    backgroundPort.send({ type: 'TRACE_STEP', step: traceStepFixture({ stepNumber: 2 }) });

    expect(store.getState().trace).toEqual([
      traceStepFixture({ stepNumber: 1 }),
      traceStepFixture({ stepNumber: 2 }),
    ]);
  });

  it('a RUN_IDLE message clears the trace too', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);

    backgroundPort.send({ type: 'TRACE_STEP', step: traceStepFixture() });
    backgroundPort.send({ type: 'RUN_IDLE' });

    expect(store.getState().trace).toEqual([]);
  });

  it('starts with no pending confirmation', () => {
    const { a: panelPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);
    expect(store.getState().pendingConfirmation).toBeUndefined();
  });

  it('a RUN_STATUS message with pendingConfirmation surfaces it', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);
    const pendingConfirmation = confirmationFixture();

    backgroundPort.send({
      type: 'RUN_STATUS',
      summary: {
        outcome: 'active',
        task: 'Delete account',
        stepCount: 1,
        replanCount: 0,
        subGoalHistory: [],
        pendingConfirmation,
      },
    });

    expect(store.getState().pendingConfirmation).toEqual(pendingConfirmation);
  });

  it('a subsequent RUN_STATUS without pendingConfirmation clears it', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);

    backgroundPort.send({
      type: 'RUN_STATUS',
      summary: {
        outcome: 'active',
        task: 'Delete account',
        stepCount: 1,
        replanCount: 0,
        subGoalHistory: [],
        pendingConfirmation: confirmationFixture(),
      },
    });
    backgroundPort.send({
      type: 'RUN_STATUS',
      summary: {
        outcome: 'active',
        task: 'Delete account',
        stepCount: 2,
        replanCount: 0,
        subGoalHistory: [],
      },
    });

    expect(store.getState().pendingConfirmation).toBeUndefined();
  });

  it('approveConfirmation/rejectConfirmation send the matching message', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);
    const received: PanelToBackgroundMessage[] = [];
    backgroundPort.onMessage((message) => received.push(message));

    store.getState().approveConfirmation();
    store.getState().rejectConfirmation();

    expect(received).toEqual([{ type: 'APPROVE_RUN' }, { type: 'REJECT_RUN' }]);
  });

  it('editConfirmation sends EDIT_RUN with the revised actions', () => {
    const { a: panelPort, b: backgroundPort } = panelAndBackgroundPorts();
    const store = createRunStore(panelPort);
    const received: PanelToBackgroundMessage[] = [];
    backgroundPort.onMessage((message) => received.push(message));

    const editedActions = [{ type: 'input_text' as const, ref: toElementRef('ax:2'), text: 'ok' }];
    store.getState().editConfirmation(editedActions);

    expect(received).toEqual([{ type: 'EDIT_RUN', actions: editedActions }]);
  });
});

import { describe, expect, it } from 'vitest';

import { createFakePortPair } from '../../messaging/fake-port';
import type {
  BackgroundToOptionsWorkflowMessage,
  OptionsToBackgroundWorkflowMessage,
} from '../../messaging/workflow-protocol';
import { createWorkflowRunTrigger } from './workflow-run-trigger';

function ports() {
  return createFakePortPair<
    OptionsToBackgroundWorkflowMessage,
    BackgroundToOptionsWorkflowMessage
  >();
}

describe('createWorkflowRunTrigger', () => {
  it('sends a TRIGGER_WORKFLOW_RUN message with a generated requestId', () => {
    const { a: optionsPort, b: backgroundPort } = ports();
    let requestId = 0;
    const trigger = createWorkflowRunTrigger(optionsPort, () => `req-${++requestId}`);
    const received: OptionsToBackgroundWorkflowMessage[] = [];
    backgroundPort.onMessage((message) => received.push(message));

    void trigger.triggerRun('workflow-1', { search_term: 'oat milk' });

    expect(received).toEqual([
      {
        type: 'TRIGGER_WORKFLOW_RUN',
        requestId: 'req-1',
        workflowId: 'workflow-1',
        values: { search_term: 'oat milk' },
      },
    ]);
  });

  it('resolves ok with the runId once the background replies with WORKFLOW_RUN_STARTED', async () => {
    const { a: optionsPort, b: backgroundPort } = ports();
    const trigger = createWorkflowRunTrigger(optionsPort, () => 'req-1');
    backgroundPort.onMessage((message) => {
      backgroundPort.send({
        type: 'WORKFLOW_RUN_STARTED',
        requestId: message.requestId,
        runId: 'run-1',
      });
    });

    const result = await trigger.triggerRun('workflow-1', {});

    expect(result.ok && result.value).toEqual({ runId: 'run-1' });
  });

  it('resolves err with the reason once the background replies with WORKFLOW_RUN_START_FAILED', async () => {
    const { a: optionsPort, b: backgroundPort } = ports();
    const trigger = createWorkflowRunTrigger(optionsPort, () => 'req-1');
    backgroundPort.onMessage((message) => {
      backgroundPort.send({
        type: 'WORKFLOW_RUN_START_FAILED',
        requestId: message.requestId,
        reason: 'run policy denies this origin',
      });
    });

    const result = await trigger.triggerRun('workflow-1', {});

    expect(!result.ok && result.error).toEqual({ message: 'run policy denies this origin' });
  });

  it('resolves each in-flight request independently by requestId, even out of order', async () => {
    const { a: optionsPort, b: backgroundPort } = ports();
    let requestId = 0;
    const trigger = createWorkflowRunTrigger(optionsPort, () => `req-${++requestId}`);
    backgroundPort.onMessage((message) => {
      if (message.workflowId === 'workflow-1') {
        return;
      }
      backgroundPort.send({
        type: 'WORKFLOW_RUN_STARTED',
        requestId: message.requestId,
        runId: 'run-early',
      });
    });

    const first = trigger.triggerRun('workflow-1', {});
    const second = trigger.triggerRun('workflow-2', {});

    const secondResult = await second;
    expect(secondResult.ok && secondResult.value).toEqual({ runId: 'run-early' });

    backgroundPort.send({ type: 'WORKFLOW_RUN_STARTED', requestId: 'req-1', runId: 'run-late' });
    const firstResult = await first;
    expect(firstResult.ok && firstResult.value).toEqual({ runId: 'run-late' });
  });

  it('ignores a reply whose requestId has no pending caller', async () => {
    const { a: optionsPort, b: backgroundPort } = ports();
    const trigger = createWorkflowRunTrigger(optionsPort, () => 'req-1');
    backgroundPort.send({ type: 'WORKFLOW_RUN_STARTED', requestId: 'unrelated', runId: 'run-x' });

    backgroundPort.onMessage((message) => {
      backgroundPort.send({
        type: 'WORKFLOW_RUN_STARTED',
        requestId: message.requestId,
        runId: 'run-1',
      });
    });
    const result = await trigger.triggerRun('workflow-1', {});

    expect(result.ok && result.value).toEqual({ runId: 'run-1' });
  });
});

import { err, ok, type Result } from '@aegis/shared';

import type { MessagePort } from '../../messaging/port';
import type {
  BackgroundToOptionsWorkflowMessage,
  OptionsToBackgroundWorkflowMessage,
} from '../../messaging/workflow-protocol';

export interface TriggerWorkflowRunError {
  readonly message: string;
}

/** Starts a workflow's background run and reports whether it actually started — the options page's "Run" action (#118). */
export interface WorkflowRunTrigger {
  triggerRun(
    workflowId: string,
    values: Readonly<Record<string, string>>,
  ): Promise<Result<{ runId: string }, TriggerWorkflowRunError>>;
}

/**
 * Wraps the request/response dance over the workflow bridge port: `TRIGGER_WORKFLOW_RUN`
 * carries a `requestId` so multiple in-flight "Run" clicks (for different workflows, or
 * retried after a failure) each resolve their own caller — the port itself is just a
 * message stream, not an RPC mechanism, so this is the layer that makes it feel like one.
 */
export function createWorkflowRunTrigger(
  port: MessagePort<OptionsToBackgroundWorkflowMessage, BackgroundToOptionsWorkflowMessage>,
  generateRequestId: () => string = () => crypto.randomUUID(),
): WorkflowRunTrigger {
  const pending = new Map<
    string,
    (result: Result<{ runId: string }, TriggerWorkflowRunError>) => void
  >();

  port.onMessage((message) => {
    const resolve = pending.get(message.requestId);
    if (resolve === undefined) {
      return;
    }
    pending.delete(message.requestId);
    if (message.type === 'WORKFLOW_RUN_STARTED') {
      resolve(ok({ runId: message.runId }));
    } else {
      resolve(err({ message: message.reason }));
    }
  });

  return {
    triggerRun(workflowId, values) {
      const requestId = generateRequestId();
      return new Promise((resolve) => {
        pending.set(requestId, resolve);
        port.send({ type: 'TRIGGER_WORKFLOW_RUN', requestId, workflowId, values });
      });
    },
  };
}

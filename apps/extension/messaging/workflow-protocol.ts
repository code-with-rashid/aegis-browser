/**
 * The options page's bridge to the background composition root (#118) — a second,
 * separate port from `RUN_BRIDGE_PORT_NAME` (`protocol.ts`): that one is scoped to the
 * side panel's live agent-loop run, with its own message shapes; triggering a *workflow*
 * background run (`BackgroundRunManager`/`Scheduler`, #115/#116) is a different concern
 * with a different message shape, not an extra case bolted onto the side panel's channel.
 *
 * `requestId` correlates a request to its response — unlike the side panel's channel
 * (one run at a time, no need to disambiguate), the options page can have several
 * "Run" actions in flight for different workflows at once.
 */
export const WORKFLOW_BRIDGE_PORT_NAME = 'aegis-workflow-bridge';

export interface OptionsToBackgroundWorkflowMessage {
  readonly type: 'TRIGGER_WORKFLOW_RUN';
  readonly requestId: string;
  readonly workflowId: string;
  readonly values: Readonly<Record<string, string>>;
}

export type BackgroundToOptionsWorkflowMessage =
  | { readonly type: 'WORKFLOW_RUN_STARTED'; readonly requestId: string; readonly runId: string }
  | {
      readonly type: 'WORKFLOW_RUN_START_FAILED';
      readonly requestId: string;
      readonly reason: string;
    };

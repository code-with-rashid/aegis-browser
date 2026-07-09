import type { LoopRunSummary } from '@aegis/agent';

/** The one long-lived `chrome.runtime` port both sides connect through. */
export const RUN_BRIDGE_PORT_NAME = 'aegis-run-bridge';

/** Messages the side panel sends to the background composition root. */
export type PanelToBackgroundMessage =
  | { readonly type: 'START_RUN'; readonly task: string; readonly tabId: number }
  | { readonly type: 'STOP_RUN' }
  | { readonly type: 'PAUSE_RUN' }
  | { readonly type: 'RESUME_RUN' };

/**
 * Messages the background sends back. `RUN_IDLE` means no run has ever started (or the
 * previous one's status was already acknowledged) — distinct from `RUN_STATUS` with
 * `outcome: 'stopped' | 'done' | 'failed'`, which reports a run that actually happened.
 */
export type BackgroundToPanelMessage =
  | { readonly type: 'RUN_IDLE' }
  | { readonly type: 'RUN_STATUS'; readonly summary: LoopRunSummary }
  | { readonly type: 'RUN_START_FAILED'; readonly reason: string };

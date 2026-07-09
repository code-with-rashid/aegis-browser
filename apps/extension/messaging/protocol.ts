import type { LoopRunSummary, TraceStep } from '@aegis/agent';

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
 *
 * `TRACE_SNAPSHOT` (the full trace so far, sent once on connect) and `TRACE_STEP` (one
 * new step, sent as each one completes) together drive the trace UI (#26): the same
 * accumulated array serves a live-updating timeline while a run is active and a replay
 * of a completed run once it's done — there's no separate "replay mode."
 */
export type BackgroundToPanelMessage =
  | { readonly type: 'RUN_IDLE' }
  | { readonly type: 'RUN_STATUS'; readonly summary: LoopRunSummary }
  | { readonly type: 'RUN_START_FAILED'; readonly reason: string }
  | { readonly type: 'TRACE_SNAPSHOT'; readonly steps: readonly TraceStep[] }
  | { readonly type: 'TRACE_STEP'; readonly step: TraceStep };

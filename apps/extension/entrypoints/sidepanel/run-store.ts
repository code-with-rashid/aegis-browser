import type { LoopErrorSummary, LoopRunOutcome } from '@aegis/agent';
import { create, type StoreApi, type UseBoundStore } from 'zustand';

import type { MessagePort } from '../../messaging/port';
import type { BackgroundToPanelMessage, PanelToBackgroundMessage } from '../../messaging/protocol';

export type RunStatus = 'idle' | LoopRunOutcome;

export interface RunState {
  readonly status: RunStatus;
  readonly task: string;
  readonly stepCount: number;
  readonly replanCount: number;
  readonly taskSummary: string | undefined;
  readonly lastError: LoopErrorSummary | undefined;
  readonly startFailedReason: string | undefined;
  /** Function-typed properties, not method shorthand — selecting one out of the store (`useRunStore((s) => s.startRun)`) must not trip `@typescript-eslint/unbound-method`. */
  readonly setTask: (task: string) => void;
  readonly startRun: (tabId: number) => void;
  readonly stopRun: () => void;
  readonly pauseRun: () => void;
  readonly resumeRun: () => void;
}

const INITIAL_RUN_FIELDS: Pick<
  RunState,
  'status' | 'stepCount' | 'replanCount' | 'taskSummary' | 'lastError' | 'startFailedReason'
> = {
  status: 'idle',
  stepCount: 0,
  replanCount: 0,
  taskSummary: undefined,
  lastError: undefined,
  startFailedReason: undefined,
};

type RunBridgePort = MessagePort<PanelToBackgroundMessage, BackgroundToPanelMessage>;

/**
 * Builds the side panel's Zustand store, wired to `port` (a real `chrome.runtime` port in
 * production, a `createFakePortPair` end in tests — see `messaging/port.ts`). The store
 * itself never touches `chrome.*`; every background message it can receive
 * (`BackgroundToPanelMessage`) is handled here so components just read state.
 */
export function createRunStore(port: RunBridgePort): UseBoundStore<StoreApi<RunState>> {
  const store = create<RunState>((set, get) => {
    port.onMessage((message: BackgroundToPanelMessage) => {
      switch (message.type) {
        case 'RUN_IDLE':
          set({ ...INITIAL_RUN_FIELDS });
          return;
        case 'RUN_STATUS':
          set({
            status: message.summary.outcome,
            task: message.summary.task,
            stepCount: message.summary.stepCount,
            replanCount: message.summary.replanCount,
            taskSummary: message.summary.taskSummary,
            lastError: message.summary.lastError,
            startFailedReason: undefined,
          });
          return;
        case 'RUN_START_FAILED':
          set({ startFailedReason: message.reason });
          return;
        default:
          return;
      }
    });

    return {
      ...INITIAL_RUN_FIELDS,
      task: '',

      setTask(task: string) {
        set({ task });
      },

      startRun(tabId: number) {
        const { task } = get();
        port.send({ type: 'START_RUN', task, tabId });
      },

      stopRun() {
        port.send({ type: 'STOP_RUN' });
      },

      pauseRun() {
        port.send({ type: 'PAUSE_RUN' });
      },

      resumeRun() {
        port.send({ type: 'RESUME_RUN' });
      },
    };
  });

  return store;
}

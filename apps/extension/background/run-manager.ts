import {
  approveLoop,
  buildTraceStep,
  clearAgentLoopSnapshot,
  createAgentLoopMachine,
  editLoop,
  hydrateAgentLoopSnapshot,
  pauseLoop,
  persistAgentLoopOnTransition,
  rejectLoop,
  resumeLoop,
  stopLoop,
  summarizeLoopRun,
  type AgentLoopContext,
  type AgentLoopEvent,
  type TraceStep,
} from '@aegis/agent';
import type { StoragePort } from '@aegis/shared';
import { createActor, type Snapshot } from 'xstate';
import { z } from 'zod';

import type { MessagePort } from '../messaging/port';
import type { BackgroundToPanelMessage, PanelToBackgroundMessage } from '../messaging/protocol';
import { buildLoopServices, type BuildLoopServicesError } from './build-loop-services';

type BackgroundPort = MessagePort<BackgroundToPanelMessage, PanelToBackgroundMessage>;

/** The minimal subset of a real XState `Actor` the run manager needs — mirrors `@aegis/agent`'s own `PersistableActor`/`LoopControlHandle` minimal-interface convention. */
interface LoopActorHandle {
  start(): void;
  stop(): void;
  send(event: AgentLoopEvent): void;
  subscribe(listener: () => void): { unsubscribe(): void };
  getSnapshot(): { readonly value: unknown; readonly context: AgentLoopContext };
  getPersistedSnapshot(): unknown;
}

function startFailedReason(error: BuildLoopServicesError): string {
  if (error.code === 'MODEL_ROUTING_NOT_CONFIGURED') {
    return error.message;
  }
  return `Could not start the run: ${error.message}`;
}

const TERMINAL_OUTCOMES: ReadonlySet<string> = new Set(['done', 'failed', 'stopped']);

/** True for `active` and `paused` alike — a paused run hasn't finished: it still blocks a new `START_RUN`, still holds its CDP session, and is still worth resuming after a service-worker restart. */
function isRunOngoing(snapshot: {
  readonly value: unknown;
  readonly context: AgentLoopContext;
}): boolean {
  return !TERMINAL_OUTCOMES.has(summarizeLoopRun(snapshot).outcome);
}

const TRACE_STORAGE_KEY = 'agent-loop-trace';
/** Our own serialized data, round-tripped through the same process — trusted, not validated at this internal boundary. */
const TraceStepsSchema = z.array(z.unknown());

/**
 * Owns the single active agent-loop run (one task at a time, matching the side panel
 * being one surface per window) and bridges its lifecycle to every connected panel port:
 * broadcasts a `RUN_STATUS`/`RUN_IDLE` on every transition, persists the snapshot after
 * every transition (`docs/DESIGN.md` §4 — MV3 workers can be evicted), and detaches the
 * live CDP session once the run reaches a terminal state. Also accumulates the run's
 * trace (`docs/adr/0014-action-trace-log-ui.md`) and broadcasts it incrementally.
 */
export interface RunManager {
  registerPort(port: BackgroundPort): void;
  /** Attempts to resume a run that was mid-flight when the service worker was last evicted. */
  initialize(): Promise<void>;
}

export function createRunManager(
  /** `chrome.storage.session` in production — cleared on browser restart, matching the loop snapshot's own lifetime (`docs/DESIGN.md` §4). */
  sessionStorage: StoragePort,
  /** `chrome.storage.local` in production — durable config (model routing, site policies) that must survive a restart. */
  localStorage: StoragePort,
  buildLoop: typeof buildLoopServices = buildLoopServices,
): RunManager {
  const ports = new Set<BackgroundPort>();
  let activeActor: LoopActorHandle | undefined;
  let stopPersisting: (() => void) | undefined;
  let trace: TraceStep[] = [];

  function broadcast(message: BackgroundToPanelMessage): void {
    for (const port of ports) {
      port.send(message);
    }
  }

  function currentStatusMessage(): BackgroundToPanelMessage {
    if (activeActor === undefined) {
      return { type: 'RUN_IDLE' };
    }
    return { type: 'RUN_STATUS', summary: summarizeLoopRun(activeActor.getSnapshot()) };
  }

  async function persistTrace(): Promise<void> {
    await sessionStorage.set(TraceStepsSchema, TRACE_STORAGE_KEY, trace);
  }

  async function loadPersistedTrace(): Promise<TraceStep[]> {
    const result = await sessionStorage.get(TraceStepsSchema, TRACE_STORAGE_KEY);
    return result.ok && result.value !== undefined ? (result.value as TraceStep[]) : [];
  }

  function attachLifecycle(actor: LoopActorHandle, detach: () => Promise<unknown>): void {
    stopPersisting?.();
    stopPersisting = persistAgentLoopOnTransition(actor, sessionStorage);

    let previousValue: unknown = actor.getSnapshot().value;

    actor.subscribe(() => {
      const snapshot = actor.getSnapshot();
      broadcast({ type: 'RUN_STATUS', summary: summarizeLoopRun(snapshot) });

      if (previousValue === 'verifying' && snapshot.value !== 'verifying') {
        const step = buildTraceStep(snapshot.context, trace.length + 1);
        if (step !== undefined) {
          trace.push(step);
          void persistTrace();
          broadcast({ type: 'TRACE_STEP', step });
        }
      }
      previousValue = snapshot.value;

      if (!isRunOngoing(snapshot)) {
        stopPersisting?.();
        stopPersisting = undefined;
        void clearAgentLoopSnapshot(sessionStorage);
        void detach();
        activeActor = undefined;
      }
    });
  }

  async function startRun(requester: BackgroundPort, task: string, tabId: number): Promise<void> {
    if (activeActor !== undefined && isRunOngoing(activeActor.getSnapshot())) {
      requester.send({ type: 'RUN_START_FAILED', reason: 'A run is already in progress' });
      return;
    }

    const builtResult = await buildLoop(localStorage, tabId);
    if (!builtResult.ok) {
      requester.send({ type: 'RUN_START_FAILED', reason: startFailedReason(builtResult.error) });
      return;
    }

    const built = builtResult.value;
    const attachResult = await built.attach();
    if (!attachResult.ok) {
      requester.send({
        type: 'RUN_START_FAILED',
        reason: `Could not attach to the page: ${attachResult.error.message}`,
      });
      return;
    }

    trace = [];
    await persistTrace();
    broadcast({ type: 'TRACE_SNAPSHOT', steps: [...trace] });

    const machine = createAgentLoopMachine(built.services, built.executorContext);
    const actor = createActor(machine, { input: { task, tabId } });
    activeActor = actor;
    attachLifecycle(actor, () => built.detach());
    actor.start();
  }

  return {
    registerPort(port) {
      ports.add(port);
      port.send(currentStatusMessage());
      port.send({ type: 'TRACE_SNAPSHOT', steps: [...trace] });

      port.onMessage((message) => {
        switch (message.type) {
          case 'START_RUN':
            void startRun(port, message.task, message.tabId);
            return;
          case 'STOP_RUN':
            if (activeActor !== undefined) {
              stopLoop(activeActor);
            }
            return;
          case 'PAUSE_RUN':
            if (activeActor !== undefined) {
              pauseLoop(activeActor);
            }
            return;
          case 'RESUME_RUN':
            if (activeActor !== undefined) {
              resumeLoop(activeActor);
            }
            return;
          case 'APPROVE_RUN':
            if (activeActor !== undefined) {
              approveLoop(activeActor);
            }
            return;
          case 'REJECT_RUN':
            if (activeActor !== undefined) {
              rejectLoop(activeActor);
            }
            return;
          case 'EDIT_RUN':
            if (activeActor !== undefined) {
              editLoop(activeActor, message.actions);
            }
            return;
          default:
            return;
        }
      });

      port.onDisconnect(() => {
        ports.delete(port);
      });
    },

    async initialize() {
      trace = await loadPersistedTrace();

      const hydrateResult = await hydrateAgentLoopSnapshot(sessionStorage);
      if (!hydrateResult.ok || hydrateResult.value === undefined) {
        return;
      }

      const persisted = hydrateResult.value as { context: AgentLoopContext; value: unknown };
      if (!isRunOngoing(persisted)) {
        await clearAgentLoopSnapshot(sessionStorage);
        return;
      }

      const { tabId, task } = persisted.context;
      const builtResult = await buildLoop(localStorage, tabId);
      if (!builtResult.ok) {
        await clearAgentLoopSnapshot(sessionStorage);
        return;
      }

      const built = builtResult.value;
      const attachResult = await built.attach();
      if (!attachResult.ok) {
        await clearAgentLoopSnapshot(sessionStorage);
        return;
      }

      const machine = createAgentLoopMachine(built.services, built.executorContext);
      const actor = createActor(machine, {
        input: { task, tabId },
        snapshot: hydrateResult.value as Snapshot<unknown>,
      });
      activeActor = actor;
      attachLifecycle(actor, () => built.detach());
      actor.start();
    },
  };
}

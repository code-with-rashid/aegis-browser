import type { Action } from '@aegis/actions';

import type { AgentLoopEvent } from './machine';

/**
 * The minimal shape a UI needs to control a running loop — satisfied structurally by a
 * real XState `Actor<...>` (its `.send` matches), but decoupled from that type so the UI
 * layer (#25+) doesn't need to import XState or `@aegis/agent`'s exact machine type,
 * and so tests can pass a plain mock.
 */
export interface LoopControlHandle {
  send(event: AgentLoopEvent): void;
}

/** Stops the loop. Takes effect immediately regardless of what the current step is doing — see `docs/adr/0008-loop-guardrails.md`. */
export function stopLoop(actor: LoopControlHandle): void {
  actor.send({ type: 'STOP' });
}

/** Pauses the loop between perceive steps; resume with {@link resumeLoop}. */
export function pauseLoop(actor: LoopControlHandle): void {
  actor.send({ type: 'PAUSE' });
}

/** Resumes a paused loop. */
export function resumeLoop(actor: LoopControlHandle): void {
  actor.send({ type: 'RESUME' });
}

/** Approves a state-changing action the policy engine flagged for confirmation. */
export function approveLoop(actor: LoopControlHandle): void {
  actor.send({ type: 'APPROVE' });
}

/** Rejects a state-changing action the policy engine flagged for confirmation — the loop replans. */
export function rejectLoop(actor: LoopControlHandle): void {
  actor.send({ type: 'REJECT' });
}

/** Revises the pending actions while still awaiting a confirmation decision (`docs/adr/0010-confirmation-gate.md`). */
export function editLoop(actor: LoopControlHandle, actions: readonly Action[]): void {
  actor.send({ type: 'EDIT', actions });
}

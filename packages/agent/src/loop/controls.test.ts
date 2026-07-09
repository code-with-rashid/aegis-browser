import { toElementRef } from '@aegis/shared';
import { describe, expect, it, vi } from 'vitest';

import type { AgentLoopEvent } from './machine';
import { approveLoop, editLoop, pauseLoop, rejectLoop, resumeLoop, stopLoop } from './controls';

function fakeHandle() {
  return { send: vi.fn<(event: AgentLoopEvent) => void>() };
}

describe('loop controls', () => {
  it('stopLoop sends STOP', () => {
    const actor = fakeHandle();
    stopLoop(actor);
    expect(actor.send).toHaveBeenCalledWith({ type: 'STOP' });
  });

  it('pauseLoop sends PAUSE', () => {
    const actor = fakeHandle();
    pauseLoop(actor);
    expect(actor.send).toHaveBeenCalledWith({ type: 'PAUSE' });
  });

  it('resumeLoop sends RESUME', () => {
    const actor = fakeHandle();
    resumeLoop(actor);
    expect(actor.send).toHaveBeenCalledWith({ type: 'RESUME' });
  });

  it('approveLoop sends APPROVE', () => {
    const actor = fakeHandle();
    approveLoop(actor);
    expect(actor.send).toHaveBeenCalledWith({ type: 'APPROVE' });
  });

  it('rejectLoop sends REJECT', () => {
    const actor = fakeHandle();
    rejectLoop(actor);
    expect(actor.send).toHaveBeenCalledWith({ type: 'REJECT' });
  });

  it('editLoop sends EDIT with the revised actions', () => {
    const actor = fakeHandle();
    const actions = [{ type: 'click' as const, ref: toElementRef('ax:1') }];
    editLoop(actor, actions);
    expect(actor.send).toHaveBeenCalledWith({ type: 'EDIT', actions });
  });
});

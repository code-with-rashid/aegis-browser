import { err, isErr, isOk, ok } from '@aegis/shared';
import { describe, expect, it, vi } from 'vitest';

import { CdpError } from './cdp-session';
import { createFakeCdp } from './fake-cdp';

describe('createFakeCdp', () => {
  it('is not attached until attach() succeeds', async () => {
    const cdp = createFakeCdp(1);
    expect(cdp.isAttached).toBe(false);

    const result = await cdp.attach();

    expect(isOk(result)).toBe(true);
    expect(cdp.isAttached).toBe(true);
  });

  it('surfaces an attach failure and stays detached', async () => {
    const cdp = createFakeCdp(1, {
      onAttach: () => err(new CdpError('CDP_ATTACH_FAILED', 'fixture failure')),
    });

    const result = await cdp.attach();

    expect(isErr(result) && result.error.code).toBe('CDP_ATTACH_FAILED');
    expect(cdp.isAttached).toBe(false);
  });

  it('detach() resets attached state', async () => {
    const cdp = createFakeCdp(1);
    await cdp.attach();

    await cdp.detach();

    expect(cdp.isAttached).toBe(false);
  });

  it('send() fails with CDP_NOT_ATTACHED before attach()', async () => {
    const cdp = createFakeCdp(1);
    const result = await cdp.send('Accessibility.getFullAXTree');
    expect(isErr(result) && result.error.code).toBe('CDP_NOT_ATTACHED');
  });

  it('send() delegates to onSend once attached', async () => {
    const onSend = vi.fn().mockReturnValue(ok({ nodes: [] }));
    const cdp = createFakeCdp(1, { onSend });
    await cdp.attach();

    const result = await cdp.send('Accessibility.getFullAXTree', { depth: -1 });

    expect(onSend).toHaveBeenCalledWith('Accessibility.getFullAXTree', { depth: -1 });
    expect(isOk(result) && result.value).toEqual({ nodes: [] });
  });

  it('on() subscribes and emit() dispatches to the handler', async () => {
    const cdp = createFakeCdp(1);
    await cdp.attach();
    const handler = vi.fn();

    cdp.on('Debugger.paused', handler);
    cdp.emit('Debugger.paused', { callFrames: [] } as never);

    expect(handler).toHaveBeenCalledWith({ callFrames: [] });
  });

  it('the unsubscribe function returned by on() stops future dispatches', async () => {
    const cdp = createFakeCdp(1);
    await cdp.attach();
    const handler = vi.fn();

    const unsubscribe = cdp.on('Debugger.resumed', handler);
    unsubscribe();
    cdp.emit('Debugger.resumed', undefined);

    expect(handler).not.toHaveBeenCalled();
  });

  it('simulateTabClosed() detaches and drops listeners', async () => {
    const cdp = createFakeCdp(1);
    await cdp.attach();
    const handler = vi.fn();
    cdp.on('Debugger.resumed', handler);

    cdp.simulateTabClosed();

    expect(cdp.isAttached).toBe(false);
    cdp.emit('Debugger.resumed', undefined);
    expect(handler).not.toHaveBeenCalled();
  });
});

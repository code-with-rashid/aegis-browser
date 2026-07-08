/// <reference types="chrome" />
import { isErr, isOk } from '@aegis/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChromeCdpSession } from './chrome-cdp-session';

type Listener = (...args: any[]) => void;

function first<T>(items: T[]): T {
  const [item] = items;
  if (item === undefined) {
    throw new Error('expected at least one listener to be registered');
  }
  return item;
}

function createListenerSet() {
  const listeners = new Set<Listener>();
  return {
    addListener: (fn: Listener) => listeners.add(fn),
    removeListener: (fn: Listener) => listeners.delete(fn),
    has: (fn: Listener) => listeners.has(fn),
    all: () => [...listeners],
  };
}

function createChromeMock() {
  const onEvent = createListenerSet();
  const onDetach = createListenerSet();
  const onRemoved = createListenerSet();

  const attach = vi.fn().mockResolvedValue(undefined);
  const detach = vi.fn().mockResolvedValue(undefined);
  const sendCommand = vi.fn().mockResolvedValue({ nodes: [] });

  const chromeMock = {
    debugger: { attach, detach, sendCommand, onEvent, onDetach },
    tabs: { onRemoved },
  };

  return { chromeMock, attach, detach, sendCommand, onEvent, onDetach, onRemoved };
}

const globalWithChrome = globalThis as unknown as { chrome?: unknown };

describe('createChromeCdpSession', () => {
  let env: ReturnType<typeof createChromeMock>;

  beforeEach(() => {
    env = createChromeMock();
    globalWithChrome.chrome = env.chromeMock;
  });

  afterEach(() => {
    delete globalWithChrome.chrome;
  });

  it('attach() calls chrome.debugger.attach and flips isAttached', async () => {
    const session = createChromeCdpSession(7);

    const result = await session.attach();

    expect(isOk(result)).toBe(true);
    expect(session.isAttached).toBe(true);
    expect(env.attach).toHaveBeenCalledWith({ tabId: 7 }, '1.3');
  });

  it('attach() registers exactly one listener per chrome event source', async () => {
    const session = createChromeCdpSession(7);
    await session.attach();

    expect(env.onEvent.all()).toHaveLength(1);
    expect(env.onDetach.all()).toHaveLength(1);
    expect(env.onRemoved.all()).toHaveLength(1);
  });

  it('attach() failure returns a typed CDP_ATTACH_FAILED error and stays detached', async () => {
    env.attach.mockRejectedValueOnce(new Error('debugger already attached'));
    const session = createChromeCdpSession(7);

    const result = await session.attach();

    expect(isErr(result) && result.error.code).toBe('CDP_ATTACH_FAILED');
    expect(session.isAttached).toBe(false);
  });

  it('detach() calls chrome.debugger.detach, flips isAttached, and removes all listeners', async () => {
    const session = createChromeCdpSession(7);
    await session.attach();

    const result = await session.detach();

    expect(isOk(result)).toBe(true);
    expect(session.isAttached).toBe(false);
    expect(env.detach).toHaveBeenCalledWith({ tabId: 7 });
    expect(env.onEvent.all()).toHaveLength(0);
    expect(env.onDetach.all()).toHaveLength(0);
    expect(env.onRemoved.all()).toHaveLength(0);
  });

  it('detach() when not attached is a no-op that succeeds', async () => {
    const session = createChromeCdpSession(7);
    const result = await session.detach();
    expect(isOk(result)).toBe(true);
    expect(env.detach).not.toHaveBeenCalled();
  });

  it('send() before attach() fails with CDP_NOT_ATTACHED', async () => {
    const session = createChromeCdpSession(7);
    const result = await session.send('Accessibility.getFullAXTree');
    expect(isErr(result) && result.error.code).toBe('CDP_NOT_ATTACHED');
  });

  it('send() forwards the method and params to chrome.debugger.sendCommand', async () => {
    const session = createChromeCdpSession(7);
    await session.attach();

    const result = await session.send('Accessibility.getFullAXTree', { depth: -1 });

    expect(env.sendCommand).toHaveBeenCalledWith({ tabId: 7 }, 'Accessibility.getFullAXTree', {
      depth: -1,
    });
    expect(isOk(result) && result.value).toEqual({ nodes: [] });
  });

  it('send() omits the params argument entirely for a no-param command', async () => {
    const session = createChromeCdpSession(7);
    await session.attach();

    await session.send('DOM.enable');

    expect(env.sendCommand).toHaveBeenCalledWith({ tabId: 7 }, 'DOM.enable');
  });

  it('send() failure returns a typed CDP_SEND_FAILED error', async () => {
    env.sendCommand.mockRejectedValueOnce(new Error('target closed'));
    const session = createChromeCdpSession(7);
    await session.attach();

    const result = await session.send('Accessibility.getFullAXTree');

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });

  it('dispatches a matching-tab CDP event to subscribers', async () => {
    const session = createChromeCdpSession(7);
    await session.attach();
    const handler = vi.fn();
    session.on('Debugger.paused', handler);

    const registered = first(env.onEvent.all());
    registered({ tabId: 7 }, 'Debugger.paused', { callFrames: [] });

    expect(handler).toHaveBeenCalledWith({ callFrames: [] });
  });

  it('ignores a CDP event for a different tab', async () => {
    const session = createChromeCdpSession(7);
    await session.attach();
    const handler = vi.fn();
    session.on('Debugger.paused', handler);

    const registered = first(env.onEvent.all());
    registered({ tabId: 999 }, 'Debugger.paused', { callFrames: [] });

    expect(handler).not.toHaveBeenCalled();
  });

  it('the tab closing flips isAttached and removes the listeners (no leak)', async () => {
    const session = createChromeCdpSession(7);
    await session.attach();

    const registeredOnRemoved = first(env.onRemoved.all());
    registeredOnRemoved(7);

    expect(session.isAttached).toBe(false);
    expect(env.onEvent.all()).toHaveLength(0);
    expect(env.onDetach.all()).toHaveLength(0);
    expect(env.onRemoved.all()).toHaveLength(0);
  });

  it('a different tab closing does not affect this session', async () => {
    const session = createChromeCdpSession(7);
    await session.attach();

    const registeredOnRemoved = first(env.onRemoved.all());
    registeredOnRemoved(999);

    expect(session.isAttached).toBe(true);
  });

  it('an unexpected debugger detach (e.g. user closed the banner) flips isAttached', async () => {
    const session = createChromeCdpSession(7);
    await session.attach();

    const registeredOnDetach = first(env.onDetach.all());
    registeredOnDetach({ tabId: 7 });

    expect(session.isAttached).toBe(false);
    expect(env.onEvent.all()).toHaveLength(0);
  });
});

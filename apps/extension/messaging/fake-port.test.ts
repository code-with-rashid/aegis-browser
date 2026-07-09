import { describe, expect, it, vi } from 'vitest';

import { createFakePortPair } from './fake-port';

describe('createFakePortPair', () => {
  it('delivers a.send to every b.onMessage listener', () => {
    const { a, b } = createFakePortPair<{ n: number }, { s: string }>();
    const received: { n: number }[] = [];
    b.onMessage((message) => received.push(message));

    a.send({ n: 1 });
    a.send({ n: 2 });

    expect(received).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('delivers b.send to every a.onMessage listener', () => {
    const { a, b } = createFakePortPair<{ n: number }, { s: string }>();
    const received: { s: string }[] = [];
    a.onMessage((message) => received.push(message));

    b.send({ s: 'hello' });

    expect(received).toEqual([{ s: 'hello' }]);
  });

  it('supports multiple listeners on the same side', () => {
    const { a, b } = createFakePortPair<{ n: number }, { s: string }>();
    const first = vi.fn();
    const second = vi.fn();
    b.onMessage(first);
    b.onMessage(second);

    a.send({ n: 1 });

    expect(first).toHaveBeenCalledWith({ n: 1 });
    expect(second).toHaveBeenCalledWith({ n: 1 });
  });

  it('unsubscribes a listener', () => {
    const { a, b } = createFakePortPair<{ n: number }, { s: string }>();
    const listener = vi.fn();
    const unsubscribe = b.onMessage(listener);
    unsubscribe();

    a.send({ n: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('a.disconnect() fires b.onDisconnect listeners', () => {
    const { a, b } = createFakePortPair<{ n: number }, { s: string }>();
    const listener = vi.fn();
    b.onDisconnect(listener);

    a.disconnect();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('b.disconnect() fires a.onDisconnect listeners', () => {
    const { a, b } = createFakePortPair<{ n: number }, { s: string }>();
    const listener = vi.fn();
    a.onDisconnect(listener);

    b.disconnect();

    expect(listener).toHaveBeenCalledOnce();
  });

  it("disconnecting one side does not fire that same side's own onDisconnect", () => {
    const { a } = createFakePortPair<{ n: number }, { s: string }>();
    const listener = vi.fn();
    a.onDisconnect(listener);

    a.disconnect();

    expect(listener).not.toHaveBeenCalled();
  });
});

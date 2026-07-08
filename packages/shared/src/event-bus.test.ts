import { describe, expect, it, vi } from 'vitest';

import { createEventBus, type EventMap } from './event-bus';

interface Events extends EventMap {
  'task:started': { taskId: string };
  'task:done': { taskId: string; success: boolean };
}

describe('event-bus', () => {
  it('invokes a subscribed handler on emit', () => {
    const bus = createEventBus<Events>();
    const handler = vi.fn();

    bus.on('task:started', handler);
    bus.emit('task:started', { taskId: 't1' });

    expect(handler).toHaveBeenCalledWith({ taskId: 't1' });
  });

  it('supports multiple independent handlers for the same event', () => {
    const bus = createEventBus<Events>();
    const first = vi.fn();
    const second = vi.fn();

    bus.on('task:done', first);
    bus.on('task:done', second);
    bus.emit('task:done', { taskId: 't1', success: true });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not invoke a handler after off() unsubscribes it', () => {
    const bus = createEventBus<Events>();
    const handler = vi.fn();

    bus.on('task:started', handler);
    bus.off('task:started', handler);
    bus.emit('task:started', { taskId: 't1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('the unsubscribe function returned by on() removes the handler', () => {
    const bus = createEventBus<Events>();
    const handler = vi.fn();

    const unsubscribe = bus.on('task:started', handler);
    unsubscribe();
    bus.emit('task:started', { taskId: 't1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('emit() on an event with no subscribers is a no-op', () => {
    const bus = createEventBus<Events>();
    expect(() => {
      bus.emit('task:started', { taskId: 't1' });
    }).not.toThrow();
  });
});

import type { MessagePort } from './port';

interface FakeEndpoint<TReceive> {
  readonly messageListeners: Set<(message: TReceive) => void>;
  readonly disconnectListeners: Set<() => void>;
}

function createEndpoint<TReceive>(): FakeEndpoint<TReceive> {
  return { messageListeners: new Set(), disconnectListeners: new Set() };
}

/** `self` is this port's own inbox (what `onMessage`/`onDisconnect` subscribe to); `peer` is the other end's inbox (what `send`/`disconnect` notify). */
function toPort<TSend, TReceive>(
  self: FakeEndpoint<TReceive>,
  peer: FakeEndpoint<TSend>,
): MessagePort<TSend, TReceive> {
  return {
    send(message) {
      for (const listener of peer.messageListeners) {
        listener(message);
      }
    },
    onMessage(listener) {
      self.messageListeners.add(listener);
      return () => self.messageListeners.delete(listener);
    },
    onDisconnect(listener) {
      self.disconnectListeners.add(listener);
      return () => self.disconnectListeners.delete(listener);
    },
    disconnect() {
      for (const listener of peer.disconnectListeners) {
        listener();
      }
    },
  };
}

/**
 * An in-memory pair of connected {@link MessagePort}s — `a.send` delivers synchronously
 * to every `b.onMessage` listener and vice versa. For tests: the Zustand store and
 * background run manager can be exercised end-to-end without any `chrome.*` global.
 */
export function createFakePortPair<TAtoB, TBtoA>(): {
  a: MessagePort<TAtoB, TBtoA>;
  b: MessagePort<TBtoA, TAtoB>;
} {
  const endpointA = createEndpoint<TBtoA>();
  const endpointB = createEndpoint<TAtoB>();
  return {
    a: toPort<TAtoB, TBtoA>(endpointA, endpointB),
    b: toPort<TBtoA, TAtoB>(endpointB, endpointA),
  };
}

/**
 * A typed, duplex, long-lived message channel — the shape both the real
 * `chrome.runtime.connect` adapter (`chrome-port.ts`) and the in-memory test double
 * (`fake-port.ts`) implement, so the Zustand store and background run manager depend on
 * neither `chrome.*` nor any particular transport directly.
 */
export interface MessagePort<TSend, TReceive> {
  send(message: TSend): void;
  /** Subscribes to incoming messages; returns an unsubscribe function. */
  onMessage(listener: (message: TReceive) => void): () => void;
  /** Subscribes to the port closing (the other end disconnected); returns an unsubscribe function. */
  onDisconnect(listener: () => void): () => void;
  disconnect(): void;
}

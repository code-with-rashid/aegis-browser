/** Maps event names to their payload type. Implemented by each module's own event map. */
export type EventMap = Record<string, unknown>;

/** A handler invoked with an event's payload. */
export type EventHandler<T> = (payload: T) => void;

/** A minimal, typed pub/sub used to decouple modules that would otherwise import each other. */
export interface EventBus<Events extends EventMap> {
  /** Subscribes to `event`, returning an unsubscribe function. */
  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void;
  /** Unsubscribes a previously-registered handler. */
  off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void;
  /** Synchronously invokes every handler registered for `event`. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void;
}

/** Creates an in-memory {@link EventBus} for the given event map. */
export function createEventBus<Events extends EventMap>(): EventBus<Events> {
  type AnyHandler = EventHandler<Events[keyof Events]>;
  const listeners = new Map<keyof Events, Set<AnyHandler>>();

  function on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    const set = listeners.get(event) ?? new Set<AnyHandler>();
    set.add(handler as AnyHandler);
    listeners.set(event, set);
    return () => {
      off(event, handler);
    };
  }

  function off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void {
    listeners.get(event)?.delete(handler as AnyHandler);
  }

  function emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = listeners.get(event);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler(payload);
    }
  }

  return { on, off, emit };
}

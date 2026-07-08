import type { ProtocolMapping } from 'devtools-protocol/types/protocol-mapping';

import { err, isOk, ok, type Result } from '@aegis/shared';

import { CdpError, type CdpSession } from './cdp-session';

/** Extra test-only controls on top of {@link CdpSession}. */
export interface FakeCdp extends CdpSession {
  /** Dispatches a fake CDP event to subscribers, as if the page had sent it. */
  emit<E extends keyof ProtocolMapping.Events>(
    event: E,
    params: ProtocolMapping.Events[E][0],
  ): void;
  /** Simulates the tab closing: forces detachment and drops all listeners, like the real adapter would. */
  simulateTabClosed(): void;
}

export interface FakeCdpOptions {
  readonly onAttach?: () => Result<void, CdpError>;
  readonly onSend?: (method: string, params: unknown) => Result<unknown, CdpError>;
}

/** An in-memory {@link CdpSession} for tests. Never touches `chrome.debugger`. */
export function createFakeCdp(tabId: number, options: FakeCdpOptions = {}): FakeCdp {
  let attached = false;
  const listeners = new Map<string, Set<(params: unknown) => void>>();

  const reset = (): void => {
    attached = false;
    listeners.clear();
  };

  return {
    tabId,

    get isAttached(): boolean {
      return attached;
    },

    attach(): Promise<Result<void, CdpError>> {
      const result = options.onAttach?.() ?? ok(undefined);
      if (isOk(result)) {
        attached = true;
      }
      return Promise.resolve(result);
    },

    detach(): Promise<Result<void, CdpError>> {
      reset();
      return Promise.resolve(ok(undefined));
    },

    send<M extends keyof ProtocolMapping.Commands>(
      method: M,
      params?: ProtocolMapping.Commands[M]['paramsType'][0],
    ): Promise<Result<ProtocolMapping.Commands[M]['returnType'], CdpError>> {
      if (!attached) {
        return Promise.resolve(
          err(
            new CdpError(
              'CDP_NOT_ATTACHED',
              `Cannot send "${method}": not attached to tab ${tabId}`,
            ),
          ),
        );
      }
      const result = options.onSend?.(method, params) ?? ok(undefined);
      return Promise.resolve(result as Result<ProtocolMapping.Commands[M]['returnType'], CdpError>);
    },

    on<E extends keyof ProtocolMapping.Events>(
      event: E,
      handler: (params: ProtocolMapping.Events[E][0]) => void,
    ): () => void {
      const handlers = listeners.get(event) ?? new Set<(params: unknown) => void>();
      handlers.add(handler as (params: unknown) => void);
      listeners.set(event, handlers);
      return () => {
        handlers.delete(handler as (params: unknown) => void);
      };
    },

    emit<E extends keyof ProtocolMapping.Events>(
      event: E,
      params: ProtocolMapping.Events[E][0],
    ): void {
      const handlers = listeners.get(event);
      if (!handlers) {
        return;
      }
      for (const handler of handlers) {
        handler(params);
      }
    },

    simulateTabClosed(): void {
      reset();
    },
  };
}

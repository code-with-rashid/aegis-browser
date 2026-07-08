/// <reference types="chrome" />
import type { ProtocolMapping } from 'devtools-protocol/types/protocol-mapping';

import { err, ok, type Result } from '@aegis/shared';

import { CdpError, type CdpSession } from './cdp-session';

const PROTOCOL_VERSION = '1.3';

/**
 * The only module in `@aegis/perception` allowed to reference `chrome.*`. Wraps
 * `chrome.debugger` (attach/detach/sendCommand/onEvent) behind the {@link CdpSession}
 * port for one tab.
 *
 * `chrome.debugger.onEvent`, `onDetach`, and `chrome.tabs.onRemoved` are process-global,
 * so this adapter filters by `tabId` and removes its listeners on detach (explicit or
 * forced by the tab closing) to avoid leaking a listener per session.
 */
export function createChromeCdpSession(tabId: number): CdpSession {
  let attached = false;
  const listeners = new Map<string, Set<(params: unknown) => void>>();

  const dispatch = (method: string, params: unknown): void => {
    const handlers = listeners.get(method);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      handler(params);
    }
  };

  const onEvent = (source: chrome.debugger.Debuggee, method: string, params?: object): void => {
    if (source.tabId !== tabId) {
      return;
    }
    dispatch(method, params);
  };

  const cleanupChromeListeners = (): void => {
    chrome.debugger.onEvent.removeListener(onEvent);
    chrome.debugger.onDetach.removeListener(onDetach);
    chrome.tabs.onRemoved.removeListener(onTabRemoved);
  };

  const onDetach = (source: chrome.debugger.Debuggee): void => {
    if (source.tabId !== tabId) {
      return;
    }
    attached = false;
    cleanupChromeListeners();
  };

  const onTabRemoved = (removedTabId: number): void => {
    if (removedTabId !== tabId) {
      return;
    }
    attached = false;
    cleanupChromeListeners();
  };

  return {
    tabId,

    get isAttached(): boolean {
      return attached;
    },

    async attach(): Promise<Result<void, CdpError>> {
      try {
        await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
      } catch (cause) {
        return err(
          new CdpError('CDP_ATTACH_FAILED', `Failed to attach to tab ${tabId}`, { cause }),
        );
      }

      chrome.debugger.onEvent.addListener(onEvent);
      chrome.debugger.onDetach.addListener(onDetach);
      chrome.tabs.onRemoved.addListener(onTabRemoved);
      attached = true;
      return ok(undefined);
    },

    async detach(): Promise<Result<void, CdpError>> {
      if (!attached) {
        return ok(undefined);
      }
      try {
        await chrome.debugger.detach({ tabId });
        return ok(undefined);
      } catch (cause) {
        return err(
          new CdpError('CDP_DETACH_FAILED', `Failed to detach from tab ${tabId}`, { cause }),
        );
      } finally {
        attached = false;
        cleanupChromeListeners();
      }
    },

    async send<M extends keyof ProtocolMapping.Commands>(
      method: M,
      params?: ProtocolMapping.Commands[M]['paramsType'][0],
    ): Promise<Result<ProtocolMapping.Commands[M]['returnType'], CdpError>> {
      if (!attached) {
        return err(
          new CdpError('CDP_NOT_ATTACHED', `Cannot send "${method}": not attached to tab ${tabId}`),
        );
      }

      try {
        const result =
          params === undefined
            ? await chrome.debugger.sendCommand({ tabId }, method)
            : await chrome.debugger.sendCommand({ tabId }, method, params);
        return ok(result as ProtocolMapping.Commands[M]['returnType']);
      } catch (cause) {
        return err(new CdpError('CDP_SEND_FAILED', `CDP command "${method}" failed`, { cause }));
      }
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
  };
}

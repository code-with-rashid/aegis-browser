import { err, ok } from '@aegis/shared';

import {
  WEBMCP_CALL_EVENT,
  WEBMCP_REQUEST_SYNC_EVENT,
  WEBMCP_RESULT_EVENT,
  WEBMCP_TOOLS_EVENT,
  type WebMcpCallEventDetail,
  type WebMcpResultEventDetail,
  type WebMcpToolsEventDetail,
} from './bridge-protocol';
import type { WebMcpSource } from './webmcp-source';
import type { WebMcpToolDescriptor } from './webmcp-tool';

export interface CreateWebMcpEventBridgeSourceOptions {
  /** How long to wait for the MAIN-world half to answer before giving up. Defaults to 5000ms — generous for a same-page round trip, short enough to fail fast if the other half was never installed. */
  readonly timeoutMs?: number;
}

/** A {@link WebMcpSource} plus a way to stop listening — for the ISOLATED-world content script to call on teardown (navigation/tab close). */
export interface WebMcpEventBridgeSource extends WebMcpSource {
  dispose(): void;
}

/**
 * The ISOLATED-world half of the WebMCP bridge: implements {@link WebMcpSource} entirely
 * over the request/response event protocol in `bridge-protocol.ts`, observed on `target`
 * (a real `document` in the browser — visible to both the MAIN and ISOLATED worlds of the
 * same page). Never touches `document.modelContext` directly — only the MAIN-world half
 * (`page-bridge.ts`) can, so every operation here is a dispatch-and-wait.
 */
export function createWebMcpEventBridgeSource(
  target: EventTarget,
  options: CreateWebMcpEventBridgeSourceOptions = {},
): WebMcpEventBridgeSource {
  const timeoutMs = options.timeoutMs ?? 5000;
  let latestTools: readonly WebMcpToolDescriptor[] | undefined;
  let nextRequestId = 0;
  const changeListeners = new Set<() => void>();
  let pendingFirstSnapshot: ((tools: readonly WebMcpToolDescriptor[]) => void)[] = [];

  function onToolsEvent(event: Event): void {
    const detail = (event as CustomEvent<WebMcpToolsEventDetail>).detail;
    const hadSnapshotAlready = latestTools !== undefined;
    latestTools = detail.tools;

    const resolvers = pendingFirstSnapshot;
    pendingFirstSnapshot = [];
    for (const resolve of resolvers) {
      resolve(detail.tools);
    }

    if (hadSnapshotAlready) {
      for (const listener of changeListeners) {
        listener();
      }
    }
  }

  target.addEventListener(WEBMCP_TOOLS_EVENT, onToolsEvent);
  // In case the MAIN-world half installed and published before this side attached its
  // listener — asking again costs nothing and closes that race in either direction.
  target.dispatchEvent(new CustomEvent(WEBMCP_REQUEST_SYNC_EVENT));

  async function firstSnapshot(): Promise<readonly WebMcpToolDescriptor[]> {
    if (latestTools !== undefined) {
      return latestTools;
    }
    return new Promise((resolve) => {
      let settled = false;
      const settle = (tools: readonly WebMcpToolDescriptor[]): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(tools);
      };
      pendingFirstSnapshot.push(settle);
      target.dispatchEvent(new CustomEvent(WEBMCP_REQUEST_SYNC_EVENT));
      // No answer within the timeout means there's no MAIN-world half installed at all
      // (WebMCP absent, or the page bridge never loaded) — resolve to "no tools", the
      // same graceful no-op `page-bridge.ts` itself uses when it detects absence.
      setTimeout(() => {
        settle([]);
      }, timeoutMs);
    });
  }

  return {
    async listTools() {
      return ok(await firstSnapshot());
    },

    callTool(name, args) {
      return new Promise((resolve) => {
        const requestId = String(nextRequestId++);

        function onResult(event: Event): void {
          const detail = (event as CustomEvent<WebMcpResultEventDetail>).detail;
          if (detail.requestId !== requestId) {
            return;
          }
          target.removeEventListener(WEBMCP_RESULT_EVENT, onResult);
          clearTimeout(timer);
          resolve(
            detail.ok ? ok({ isError: false, text: detail.text }) : err({ message: detail.error }),
          );
        }

        const timer = setTimeout(() => {
          target.removeEventListener(WEBMCP_RESULT_EVENT, onResult);
          resolve(err({ message: `Timed out waiting for WebMCP tool "${name}" to respond` }));
        }, timeoutMs);

        target.addEventListener(WEBMCP_RESULT_EVENT, onResult);
        const detail: WebMcpCallEventDetail = { requestId, name, args };
        target.dispatchEvent(new CustomEvent(WEBMCP_CALL_EVENT, { detail }));
      });
    },

    onToolsChanged(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },

    dispose() {
      target.removeEventListener(WEBMCP_TOOLS_EVENT, onToolsEvent);
      changeListeners.clear();
      pendingFirstSnapshot = [];
    },
  };
}

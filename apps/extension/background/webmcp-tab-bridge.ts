import type { WebMcpSource, WebMcpToolDescriptor } from '@aegis/mcp';
import { err, ok } from '@aegis/shared';

import type { MessagePort } from '../messaging/port';
import type {
  BackgroundToContentWebMcpMessage,
  ContentToBackgroundWebMcpMessage,
} from '../messaging/webmcp-protocol';

type TabPort = MessagePort<BackgroundToContentWebMcpMessage, ContentToBackgroundWebMcpMessage>;

interface TabState {
  port: TabPort | undefined;
  latestTools: readonly WebMcpToolDescriptor[] | undefined;
  nextRequestId: number;
  readonly changeListeners: Set<() => void>;
  readonly pendingFirstSnapshot: ((tools: readonly WebMcpToolDescriptor[]) => void)[];
  readonly pendingCalls: Map<string, (message: ContentToBackgroundWebMcpMessage) => void>;
}

function createTabState(): TabState {
  return {
    port: undefined,
    latestTools: undefined,
    nextRequestId: 0,
    changeListeners: new Set(),
    pendingFirstSnapshot: [],
    pendingCalls: new Map(),
  };
}

export interface CreateWebMcpTabBridgeOptions {
  /** How long `listTools()`/`callTool()` wait for a connected tab's content script to answer before failing safe. Defaults to 3000ms — generous for a same-machine round trip through the background, short enough that a task start never hangs noticeably on a page with no WebMCP bridge. */
  readonly timeoutMs?: number;
}

/**
 * Bridges each tab's WebMCP relay content script (`webmcp-relay.content.ts`) to a
 * per-tab {@link WebMcpSource} `buildLoopServices` can register into that tab's
 * `ToolRegistry` — the composition-root wiring `docs/adr/0035-webmcp-detection-and-adapter.md`
 * deliberately deferred out of #87. Mirrors `isolated-bridge.ts`'s own shape (a
 * request/response protocol, a bounded wait for the first snapshot, resync via
 * `onToolsChanged`) one level up: content-script-to-background instead of
 * MAIN-world-to-ISOLATED-world.
 */
export interface WebMcpTabBridge {
  /** Call once per connecting content script (`listenForWebMcpTabConnections`'s callback). */
  registerPort(tabId: number, port: TabPort): void;
  /** A `WebMcpSource` scoped to `tabId` — safe to call even if no content script has ever connected for it (resolves to no tools, never throws). */
  getSource(tabId: number): WebMcpSource;
}

export function createWebMcpTabBridge(options: CreateWebMcpTabBridgeOptions = {}): WebMcpTabBridge {
  const timeoutMs = options.timeoutMs ?? 3000;
  const tabs = new Map<number, TabState>();

  function stateFor(tabId: number): TabState {
    const existing = tabs.get(tabId);
    if (existing !== undefined) {
      return existing;
    }
    const created = createTabState();
    tabs.set(tabId, created);
    return created;
  }

  return {
    registerPort(tabId, port) {
      const state = stateFor(tabId);
      state.port = port;

      port.onMessage((message) => {
        if (message.type === 'WEBMCP_TOOLS') {
          const hadSnapshotAlready = state.latestTools !== undefined;
          state.latestTools = message.tools;

          const resolvers = state.pendingFirstSnapshot.splice(0);
          for (const resolve of resolvers) {
            resolve(message.tools);
          }
          if (hadSnapshotAlready) {
            for (const listener of state.changeListeners) {
              listener();
            }
          }
          return;
        }

        const resolve = state.pendingCalls.get(message.requestId);
        if (resolve !== undefined) {
          state.pendingCalls.delete(message.requestId);
          resolve(message);
        }
      });

      port.onDisconnect(() => {
        state.port = undefined;
        state.latestTools = undefined;
      });
    },

    getSource(tabId) {
      const state = stateFor(tabId);

      return {
        listTools() {
          if (state.latestTools !== undefined) {
            return Promise.resolve(ok(state.latestTools));
          }
          return new Promise((resolve) => {
            let settled = false;
            state.pendingFirstSnapshot.push((tools) => {
              if (settled) {
                return;
              }
              settled = true;
              resolve(ok(tools));
            });
            setTimeout(() => {
              if (settled) {
                return;
              }
              settled = true;
              resolve(ok([]));
            }, timeoutMs);
          });
        },

        callTool(name, args) {
          const port = state.port;
          if (port === undefined) {
            return Promise.resolve(
              err({ message: `No WebMCP bridge connected for this tab (calling "${name}")` }),
            );
          }
          return new Promise((resolve) => {
            const requestId = String(state.nextRequestId++);
            const timer = setTimeout(() => {
              state.pendingCalls.delete(requestId);
              resolve(err({ message: `Timed out waiting for WebMCP tool "${name}" to respond` }));
            }, timeoutMs);

            state.pendingCalls.set(requestId, (message) => {
              clearTimeout(timer);
              if (message.type !== 'WEBMCP_CALL_RESULT') {
                return;
              }
              resolve(
                message.ok
                  ? ok({ isError: false, text: message.text })
                  : err({ message: message.error }),
              );
            });

            port.send({ type: 'WEBMCP_CALL_TOOL', requestId, name, args });
          });
        },

        onToolsChanged(listener) {
          state.changeListeners.add(listener);
          return () => state.changeListeners.delete(listener);
        },
      };
    },
  };
}

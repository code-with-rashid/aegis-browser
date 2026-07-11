import type { MessagePort } from './port';
import { RUN_BRIDGE_PORT_NAME } from './protocol';
import { WEBMCP_TAB_PORT_NAME } from './webmcp-protocol';
import { WORKFLOW_BRIDGE_PORT_NAME } from './workflow-protocol';

function wrapChromePort<TSend, TReceive>(port: chrome.runtime.Port): MessagePort<TSend, TReceive> {
  return {
    send(message) {
      port.postMessage(message);
    },
    onMessage(listener) {
      const handler = (message: unknown): void => {
        listener(message as TReceive);
      };
      port.onMessage.addListener(handler);
      return () => {
        port.onMessage.removeListener(handler);
      };
    },
    onDisconnect(listener) {
      port.onDisconnect.addListener(listener);
      return () => {
        port.onDisconnect.removeListener(listener);
      };
    },
    disconnect() {
      port.disconnect();
    },
  };
}

/** The side panel's end of the bridge — call once when the panel mounts. */
export function connectToBackground<TSend, TReceive>(): MessagePort<TSend, TReceive> {
  return wrapChromePort(chrome.runtime.connect({ name: RUN_BRIDGE_PORT_NAME }));
}

/** The background's end — call once at startup; invokes `onConnection` for each panel that connects. */
export function listenForPanelConnections<TSend, TReceive>(
  onConnection: (port: MessagePort<TSend, TReceive>) => void,
): () => void {
  const listener = (port: chrome.runtime.Port): void => {
    if (port.name !== RUN_BRIDGE_PORT_NAME) {
      return;
    }
    onConnection(wrapChromePort(port));
  };
  chrome.runtime.onConnect.addListener(listener);
  return () => {
    chrome.runtime.onConnect.removeListener(listener);
  };
}

/** The options page's end of the workflow bridge — call once when the panel mounts. */
export function connectToBackgroundWorkflowBridge<TSend, TReceive>(): MessagePort<TSend, TReceive> {
  return wrapChromePort(chrome.runtime.connect({ name: WORKFLOW_BRIDGE_PORT_NAME }));
}

/** The background's end — call once at startup; invokes `onConnection` for each options page that connects. */
export function listenForWorkflowBridgeConnections<TSend, TReceive>(
  onConnection: (port: MessagePort<TSend, TReceive>) => void,
): () => void {
  const listener = (port: chrome.runtime.Port): void => {
    if (port.name !== WORKFLOW_BRIDGE_PORT_NAME) {
      return;
    }
    onConnection(wrapChromePort(port));
  };
  chrome.runtime.onConnect.addListener(listener);
  return () => {
    chrome.runtime.onConnect.removeListener(listener);
  };
}

/** The WebMCP relay content script's end — call once when it installs. */
export function connectWebMcpTabBridge<TSend, TReceive>(): MessagePort<TSend, TReceive> {
  return wrapChromePort(chrome.runtime.connect({ name: WEBMCP_TAB_PORT_NAME }));
}

/**
 * The background's end — call once at startup; invokes `onConnection` with the
 * connecting tab's id for each WebMCP relay content script that connects. A port whose
 * sender has no tab (e.g. a devtools page) is ignored — this bridge is tab-scoped only.
 */
export function listenForWebMcpTabConnections<TSend, TReceive>(
  onConnection: (tabId: number, port: MessagePort<TSend, TReceive>) => void,
): () => void {
  const listener = (port: chrome.runtime.Port): void => {
    if (port.name !== WEBMCP_TAB_PORT_NAME) {
      return;
    }
    const tabId = port.sender?.tab?.id;
    if (tabId === undefined) {
      return;
    }
    onConnection(tabId, wrapChromePort(port));
  };
  chrome.runtime.onConnect.addListener(listener);
  return () => {
    chrome.runtime.onConnect.removeListener(listener);
  };
}

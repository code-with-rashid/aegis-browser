import type { MessagePort } from './port';
import { RUN_BRIDGE_PORT_NAME } from './protocol';

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

import { createChromeStorageAdapter, createLogger } from '@aegis/shared';
import { defineBackground } from 'wxt/utils/define-background';

import { createBackgroundRunManager } from '../background/background-run-manager';
import { createRunManager } from '../background/run-manager';
import { createWebMcpTabBridge } from '../background/webmcp-tab-bridge';
import { listenForPanelConnections, listenForWebMcpTabConnections } from '../messaging/chrome-port';
import type { BackgroundToPanelMessage, PanelToBackgroundMessage } from '../messaging/protocol';
import type {
  BackgroundToContentWebMcpMessage,
  ContentToBackgroundWebMcpMessage,
} from '../messaging/webmcp-protocol';

const logger = createLogger('background');

/** No UI configures this yet (#116/#117 territory) — a conservative fixed cap so an unattended workflow run can never pile up unboundedly. */
const MAX_CONCURRENT_BACKGROUND_RUNS = 1;

export default defineBackground(() => {
  logger.info('background service worker started');

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    logger.error('Failed to set side panel behavior', { error });
  });

  const webMcpTabBridge = createWebMcpTabBridge();
  listenForWebMcpTabConnections<BackgroundToContentWebMcpMessage, ContentToBackgroundWebMcpMessage>(
    (tabId, port) => {
      webMcpTabBridge.registerPort(tabId, port);
    },
  );

  const runManager = createRunManager(
    createChromeStorageAdapter(chrome.storage.session),
    createChromeStorageAdapter(chrome.storage.local),
    undefined,
    (tabId) => webMcpTabBridge.getSource(tabId),
  );

  listenForPanelConnections<BackgroundToPanelMessage, PanelToBackgroundMessage>((port) => {
    runManager.registerPort(port);
  });

  runManager.initialize().catch((error: unknown) => {
    logger.error('Failed to resume a persisted run', { error });
  });

  const localStorage = createChromeStorageAdapter(chrome.storage.local);
  const backgroundRunManager = createBackgroundRunManager(
    localStorage,
    localStorage,
    MAX_CONCURRENT_BACKGROUND_RUNS,
  );

  backgroundRunManager.initialize().catch((error: unknown) => {
    logger.error('Failed to resume a persisted background workflow run', { error });
  });
});

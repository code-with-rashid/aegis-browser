import { createChromeStorageAdapter, createLogger } from '@aegis/shared';
import { defineBackground } from 'wxt/utils/define-background';

import { createRunManager } from '../background/run-manager';
import { listenForPanelConnections } from '../messaging/chrome-port';
import type { BackgroundToPanelMessage, PanelToBackgroundMessage } from '../messaging/protocol';

const logger = createLogger('background');

export default defineBackground(() => {
  logger.info('background service worker started');

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    logger.error('Failed to set side panel behavior', { error });
  });

  const runManager = createRunManager(
    createChromeStorageAdapter(chrome.storage.session),
    createChromeStorageAdapter(chrome.storage.local),
  );

  listenForPanelConnections<BackgroundToPanelMessage, PanelToBackgroundMessage>((port) => {
    runManager.registerPort(port);
  });

  runManager.initialize().catch((error: unknown) => {
    logger.error('Failed to resume a persisted run', { error });
  });
});

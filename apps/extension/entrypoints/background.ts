import { createChromeStorageAdapter, createLogger } from '@aegis/shared';
import { defineBackground } from 'wxt/utils/define-background';

import { createBackgroundRunManager } from '../background/background-run-manager';
import { createRunManager } from '../background/run-manager';
import { createScheduler } from '../background/scheduler';
import { createWebMcpTabBridge } from '../background/webmcp-tab-bridge';
import { listenForPanelConnections, listenForWebMcpTabConnections } from '../messaging/chrome-port';
import type { BackgroundToPanelMessage, PanelToBackgroundMessage } from '../messaging/protocol';
import type {
  BackgroundToContentWebMcpMessage,
  ContentToBackgroundWebMcpMessage,
} from '../messaging/webmcp-protocol';

const logger = createLogger('background');

/** No UI configures this yet (#117 territory) — a conservative fixed cap so an unattended workflow run can never pile up unboundedly. */
const MAX_CONCURRENT_BACKGROUND_RUNS = 1;

/** `chrome.alarms`' own minimum granularity — schedules are checked at most once a minute; a `daily`/`interval` schedule's own due-check (`@aegis/workflows`' `isScheduleDue`) still fires it only when actually due. */
const SCHEDULE_CHECK_ALARM_NAME = 'aegis-schedule-check';
const SCHEDULE_CHECK_PERIOD_MINUTES = 1;

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

  const scheduler = createScheduler(localStorage, backgroundRunManager);
  chrome.alarms
    .create(SCHEDULE_CHECK_ALARM_NAME, { periodInMinutes: SCHEDULE_CHECK_PERIOD_MINUTES })
    .catch((error: unknown) => {
      logger.error('Failed to create the schedule-check alarm', { error });
    });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SCHEDULE_CHECK_ALARM_NAME) {
      void scheduler.checkSchedules(Date.now());
    }
  });
});

import { createLogger } from '@aegis/shared';

const logger = createLogger('background');

export default defineBackground(() => {
  logger.info('background service worker started');

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    logger.error('Failed to set side panel behavior', { error });
  });
});

import { PACKAGE_NAME } from '@aegis/shared';

export default defineBackground(() => {
  console.log(`${PACKAGE_NAME} background service worker started`);

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('Failed to set side panel behavior', error);
  });
});

import { err, ok } from '@aegis/shared';

import { TabManagerError, type TabManager } from './tab-manager';

/** Real {@link TabManager} adapter backed by `chrome.tabs`. */
export function createChromeTabManager(initialTabId?: number): TabManager {
  let currentTabId = initialTabId;

  return {
    get currentTabId() {
      return currentTabId;
    },
    async openTab(url) {
      try {
        const tab = await chrome.tabs.create(url !== undefined ? { url } : {});
        if (tab.id === undefined) {
          return err(new TabManagerError('TAB_OPEN_FAILED', 'Created tab has no id'));
        }
        currentTabId = tab.id;
        return ok({ tabId: tab.id });
      } catch (cause) {
        return err(new TabManagerError('TAB_OPEN_FAILED', 'Failed to open a new tab', { cause }));
      }
    },
    async switchTab(tabId) {
      try {
        await chrome.tabs.update(tabId, { active: true });
        currentTabId = tabId;
        return ok(undefined);
      } catch (cause) {
        return err(
          new TabManagerError('TAB_SWITCH_FAILED', `Failed to switch to tab ${tabId}`, { cause }),
        );
      }
    },
    async closeTab(tabId) {
      const target = tabId ?? currentTabId;
      if (target === undefined) {
        return err(
          new TabManagerError('TAB_CLOSE_FAILED', 'No tab id given and no current tab is known'),
        );
      }
      try {
        await chrome.tabs.remove(target);
        if (currentTabId === target) {
          currentTabId = undefined;
        }
        return ok(undefined);
      } catch (cause) {
        return err(
          new TabManagerError('TAB_CLOSE_FAILED', `Failed to close tab ${target}`, { cause }),
        );
      }
    },
  };
}

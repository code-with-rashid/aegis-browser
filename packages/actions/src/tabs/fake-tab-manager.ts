import { err, ok } from '@aegis/shared';

import { TabManagerError, type TabManager } from './tab-manager';

export interface FakeTabManager extends TabManager {
  readonly openTabIds: readonly number[];
}

/** In-memory {@link TabManager} test double — no real `chrome.tabs` calls. */
export function createFakeTabManager(initialTabId?: number): FakeTabManager {
  const tabIds = new Set<number>(initialTabId !== undefined ? [initialTabId] : []);
  let currentTabId = initialTabId;
  let nextTabId = (initialTabId ?? 0) + 1;

  return {
    get currentTabId() {
      return currentTabId;
    },
    get openTabIds() {
      return [...tabIds];
    },
    openTab(_url) {
      const tabId = nextTabId;
      nextTabId += 1;
      tabIds.add(tabId);
      currentTabId = tabId;
      return Promise.resolve(ok({ tabId }));
    },
    switchTab(tabId) {
      if (!tabIds.has(tabId)) {
        return Promise.resolve(
          err(new TabManagerError('TAB_SWITCH_FAILED', `Unknown tab ${tabId}`)),
        );
      }
      currentTabId = tabId;
      return Promise.resolve(ok(undefined));
    },
    closeTab(tabId) {
      const target = tabId ?? currentTabId;
      if (target === undefined || !tabIds.has(target)) {
        return Promise.resolve(
          err(new TabManagerError('TAB_CLOSE_FAILED', `Unknown tab ${String(target)}`)),
        );
      }
      tabIds.delete(target);
      if (currentTabId === target) {
        currentTabId = undefined;
      }
      return Promise.resolve(ok(undefined));
    },
  };
}

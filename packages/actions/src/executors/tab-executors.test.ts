import { isErr, isOk } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createFakeTabManager } from '../tabs/fake-tab-manager';
import { executeCloseTab, executeOpenTab, executeSwitchTab } from './tab-executors';

describe('executeOpenTab', () => {
  it('opens a new tab via the tab manager', async () => {
    const tabManager = createFakeTabManager(1);

    const result = await executeOpenTab(tabManager, {
      type: 'open_tab',
      url: 'https://example.com',
    });

    expect(isOk(result) && result.value).toEqual({ kind: 'open_tab', tabId: 2 });
  });
});

describe('executeSwitchTab', () => {
  it('switches to the given tab', async () => {
    const tabManager = createFakeTabManager(1);
    await tabManager.openTab();

    const result = await executeSwitchTab(tabManager, { type: 'switch_tab', tabId: 1 });

    expect(isOk(result) && result.value).toEqual({ kind: 'switch_tab' });
  });

  it('propagates a failure to switch to an unknown tab', async () => {
    const tabManager = createFakeTabManager(1);

    const result = await executeSwitchTab(tabManager, { type: 'switch_tab', tabId: 99 });

    expect(isErr(result) && result.error.code).toBe('TAB_OPERATION_FAILED');
  });
});

describe('executeCloseTab', () => {
  it('closes the current tab when no tabId is given', async () => {
    const tabManager = createFakeTabManager(1);

    const result = await executeCloseTab(tabManager, { type: 'close_tab' });

    expect(isOk(result) && result.value).toEqual({ kind: 'close_tab' });
  });

  it('propagates a failure to close an unknown tab', async () => {
    const tabManager = createFakeTabManager(1);

    const result = await executeCloseTab(tabManager, { type: 'close_tab', tabId: 99 });

    expect(isErr(result) && result.error.code).toBe('TAB_OPERATION_FAILED');
  });
});

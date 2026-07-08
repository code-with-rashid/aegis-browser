import { isErr, isOk } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createFakeTabManager } from './fake-tab-manager';

describe('createFakeTabManager', () => {
  it('starts with no current tab by default', () => {
    const manager = createFakeTabManager();
    expect(manager.currentTabId).toBeUndefined();
    expect(manager.openTabIds).toEqual([]);
  });

  it('accepts an initial tab id', () => {
    const manager = createFakeTabManager(1);
    expect(manager.currentTabId).toBe(1);
    expect(manager.openTabIds).toEqual([1]);
  });

  it('opens a new tab, assigning it a fresh id and making it current', async () => {
    const manager = createFakeTabManager(1);

    const result = await manager.openTab('https://example.com');

    expect(isOk(result) && result.value.tabId).toBe(2);
    expect(manager.currentTabId).toBe(2);
    expect(manager.openTabIds).toEqual([1, 2]);
  });

  it('switches to a known tab', async () => {
    const manager = createFakeTabManager(1);
    await manager.openTab();

    const result = await manager.switchTab(1);

    expect(isOk(result)).toBe(true);
    expect(manager.currentTabId).toBe(1);
  });

  it('fails to switch to an unknown tab', async () => {
    const manager = createFakeTabManager(1);

    const result = await manager.switchTab(99);

    expect(isErr(result) && result.error.code).toBe('TAB_SWITCH_FAILED');
  });

  it('closes a given tab and clears currentTabId if it was current', async () => {
    const manager = createFakeTabManager(1);

    const result = await manager.closeTab(1);

    expect(isOk(result)).toBe(true);
    expect(manager.currentTabId).toBeUndefined();
    expect(manager.openTabIds).toEqual([]);
  });

  it('closes the current tab when no tabId is given', async () => {
    const manager = createFakeTabManager(1);

    await manager.closeTab();

    expect(manager.openTabIds).toEqual([]);
  });

  it('fails to close an unknown tab', async () => {
    const manager = createFakeTabManager(1);

    const result = await manager.closeTab(99);

    expect(isErr(result) && result.error.code).toBe('TAB_CLOSE_FAILED');
  });

  it('fails to close when no tabId is given and no current tab is known', async () => {
    const manager = createFakeTabManager();

    const result = await manager.closeTab();

    expect(isErr(result) && result.error.code).toBe('TAB_CLOSE_FAILED');
  });
});

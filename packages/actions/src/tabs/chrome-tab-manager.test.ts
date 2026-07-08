/// <reference types="chrome" />
import { isErr, isOk } from '@aegis/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChromeTabManager } from './chrome-tab-manager';

function createChromeMock() {
  const create = vi.fn();
  const update = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  return { chromeMock: { tabs: { create, update, remove } }, create, update, remove };
}

const globalWithChrome = globalThis as unknown as { chrome?: unknown };

describe('createChromeTabManager', () => {
  let env: ReturnType<typeof createChromeMock>;

  beforeEach(() => {
    env = createChromeMock();
    globalWithChrome.chrome = env.chromeMock;
  });

  afterEach(() => {
    delete globalWithChrome.chrome;
  });

  it('opens a new tab and tracks it as current', async () => {
    env.create.mockResolvedValue({ id: 42 });
    const manager = createChromeTabManager();

    const result = await manager.openTab('https://example.com');

    expect(isOk(result) && result.value).toEqual({ tabId: 42 });
    expect(env.create).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(manager.currentTabId).toBe(42);
  });

  it('opens a blank tab when no url is given', async () => {
    env.create.mockResolvedValue({ id: 7 });
    const manager = createChromeTabManager();

    await manager.openTab();

    expect(env.create).toHaveBeenCalledWith({});
  });

  it('fails when the created tab has no id', async () => {
    env.create.mockResolvedValue({});
    const manager = createChromeTabManager();

    const result = await manager.openTab();

    expect(isErr(result) && result.error.code).toBe('TAB_OPEN_FAILED');
  });

  it('fails when chrome.tabs.create rejects', async () => {
    env.create.mockRejectedValue(new Error('no permission'));
    const manager = createChromeTabManager();

    const result = await manager.openTab();

    expect(isErr(result) && result.error.code).toBe('TAB_OPEN_FAILED');
  });

  it('switches to a tab and updates currentTabId', async () => {
    const manager = createChromeTabManager(1);

    const result = await manager.switchTab(5);

    expect(isOk(result)).toBe(true);
    expect(env.update).toHaveBeenCalledWith(5, { active: true });
    expect(manager.currentTabId).toBe(5);
  });

  it('fails when chrome.tabs.update rejects', async () => {
    env.update.mockRejectedValue(new Error('tab gone'));
    const manager = createChromeTabManager();

    const result = await manager.switchTab(5);

    expect(isErr(result) && result.error.code).toBe('TAB_SWITCH_FAILED');
  });

  it('closes the given tab', async () => {
    const manager = createChromeTabManager(1);

    const result = await manager.closeTab(1);

    expect(isOk(result)).toBe(true);
    expect(env.remove).toHaveBeenCalledWith(1);
    expect(manager.currentTabId).toBeUndefined();
  });

  it('closes the current tab when no tabId is given', async () => {
    const manager = createChromeTabManager(9);

    await manager.closeTab();

    expect(env.remove).toHaveBeenCalledWith(9);
  });

  it('fails to close when no tabId is given and no current tab is known', async () => {
    const manager = createChromeTabManager();

    const result = await manager.closeTab();

    expect(isErr(result) && result.error.code).toBe('TAB_CLOSE_FAILED');
  });

  it('fails when chrome.tabs.remove rejects', async () => {
    env.remove.mockRejectedValue(new Error('already closed'));
    const manager = createChromeTabManager(1);

    const result = await manager.closeTab(1);

    expect(isErr(result) && result.error.code).toBe('TAB_CLOSE_FAILED');
  });
});

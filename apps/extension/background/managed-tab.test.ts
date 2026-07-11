/// <reference types="chrome" />
import { isErr, isOk } from '@aegis/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeManagedTab, openManagedTab } from './managed-tab';

function createChromeMock() {
  const create = vi.fn();
  const remove = vi.fn().mockResolvedValue(undefined);
  return { chromeMock: { tabs: { create, remove } }, create, remove };
}

const globalWithChrome = globalThis as unknown as { chrome?: unknown };

describe('managed-tab', () => {
  let env: ReturnType<typeof createChromeMock>;

  beforeEach(() => {
    env = createChromeMock();
    globalWithChrome.chrome = env.chromeMock;
  });

  afterEach(() => {
    delete globalWithChrome.chrome;
  });

  describe('openManagedTab', () => {
    it('opens a non-active tab at the given url', async () => {
      env.create.mockResolvedValue({ id: 42 });

      const result = await openManagedTab('https://shop.example.com');

      expect(isOk(result) && result.value).toEqual({ tabId: 42 });
      expect(env.create).toHaveBeenCalledWith({ url: 'https://shop.example.com', active: false });
    });

    it('fails with MANAGED_TAB_OPEN_FAILED when the created tab has no id', async () => {
      env.create.mockResolvedValue({});

      const result = await openManagedTab('https://shop.example.com');

      expect(isErr(result) && result.error.code).toBe('MANAGED_TAB_OPEN_FAILED');
    });

    it('fails with MANAGED_TAB_OPEN_FAILED when chrome.tabs.create rejects', async () => {
      env.create.mockRejectedValue(new Error('boom'));

      const result = await openManagedTab('https://shop.example.com');

      expect(isErr(result) && result.error.code).toBe('MANAGED_TAB_OPEN_FAILED');
    });
  });

  describe('closeManagedTab', () => {
    it('closes the tab', async () => {
      const result = await closeManagedTab(42);

      expect(isOk(result)).toBe(true);
      expect(env.remove).toHaveBeenCalledWith(42);
    });

    it('succeeds (not an error) when the tab is already gone', async () => {
      env.remove.mockRejectedValue(new Error('No tab with id: 42.'));

      const result = await closeManagedTab(42);

      expect(isOk(result)).toBe(true);
    });

    it('fails with MANAGED_TAB_CLOSE_FAILED on a genuine close failure', async () => {
      env.remove.mockRejectedValue(new Error('permission denied'));

      const result = await closeManagedTab(42);

      expect(isErr(result) && result.error.code).toBe('MANAGED_TAB_CLOSE_FAILED');
    });
  });
});

/// <reference types="chrome" />
import { isErr, isOk } from '@aegis/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyRunBlocked } from './notify';

function createChromeMock() {
  const create = vi.fn((_options: unknown, callback?: (notificationId: string) => void) => {
    callback?.('notification-id');
  });
  return { chromeMock: { notifications: { create }, runtime: { lastError: undefined } }, create };
}

const globalWithChrome = globalThis as unknown as { chrome?: unknown };

describe('notifyRunBlocked', () => {
  let env: ReturnType<typeof createChromeMock>;

  beforeEach(() => {
    env = createChromeMock();
    globalWithChrome.chrome = env.chromeMock;
  });

  afterEach(() => {
    delete globalWithChrome.chrome;
  });

  it('shows a basic notification naming the workflow and the block reason', async () => {
    const result = await notifyRunBlocked('Check order status', 'Tool outside RunPolicy');

    expect(isOk(result)).toBe(true);
    expect(env.create).toHaveBeenCalledTimes(1);
    const options = env.create.mock.calls[0]?.[0] as {
      type: string;
      title: string;
      message: string;
    };
    expect(options.type).toBe('basic');
    expect(options.title).toContain('Check order status');
    expect(options.message).toBe('Tool outside RunPolicy');
  });

  it('fails with NOTIFY_FAILED, without throwing, when chrome.runtime.lastError is set', async () => {
    env.create.mockImplementation((_options: unknown, callback?: (id: string) => void) => {
      env.chromeMock.runtime.lastError = { message: 'permission denied' } as never;
      callback?.('');
    });

    const result = await notifyRunBlocked('Check order status', 'Tool outside RunPolicy');

    expect(isErr(result) && result.error.code).toBe('NOTIFY_FAILED');
  });

  it('fails with NOTIFY_FAILED, without throwing, when chrome.notifications.create throws synchronously', async () => {
    env.create.mockImplementation(() => {
      throw new Error('notifications API unavailable');
    });

    const result = await notifyRunBlocked('Check order status', 'Tool outside RunPolicy');

    expect(isErr(result) && result.error.code).toBe('NOTIFY_FAILED');
  });
});

/// <reference types="chrome" />
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isErr, isOk } from '../result';
import { createChromeStorageAdapter } from './chrome-storage-adapter';

const schema = z.object({ count: z.number() });

/** A minimal fake of `chrome.storage.StorageArea`, just enough for the adapter's calls. */
function createFakeArea(initial: Record<string, unknown> = {}): chrome.storage.StorageArea {
  const store: Record<string, unknown> = { ...initial };

  const fake = {
    get(keys?: unknown) {
      if (typeof keys === 'string') {
        return Promise.resolve(keys in store ? { [keys]: store[keys] } : {});
      }
      return Promise.resolve({ ...store });
    },
    set(items: Record<string, unknown>) {
      Object.assign(store, items);
      return Promise.resolve();
    },
    remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        Reflect.deleteProperty(store, key);
      }
      return Promise.resolve();
    },
  };

  return fake as unknown as chrome.storage.StorageArea;
}

describe('chrome storage adapter', () => {
  it('returns undefined for a key that was never set', async () => {
    const storage = createChromeStorageAdapter(createFakeArea());
    const result = await storage.get(schema, 'missing');
    expect(isOk(result) && result.value).toBeUndefined();
  });

  it('round-trips a value through set() and get()', async () => {
    const storage = createChromeStorageAdapter(createFakeArea());

    await storage.set(schema, 'counter', { count: 1 });
    const result = await storage.get(schema, 'counter');

    expect(isOk(result) && result.value).toEqual({ count: 1 });
  });

  it('removes a stored value', async () => {
    const storage = createChromeStorageAdapter(createFakeArea({ counter: { count: 1 } }));

    await storage.remove('counter');
    const result = await storage.get(schema, 'counter');

    expect(isOk(result) && result.value).toBeUndefined();
  });

  it('rejects a write that fails schema validation', async () => {
    const storage = createChromeStorageAdapter(createFakeArea());

    // @ts-expect-error -- intentionally invalid to exercise the validation failure path
    const result = await storage.set(schema, 'counter', { count: 'nope' });

    expect(isErr(result) && result.error.code).toBe('STORAGE_VALIDATION_FAILED');
  });

  it('surfaces a validation error when a stored value no longer matches the schema', async () => {
    const storage = createChromeStorageAdapter(createFakeArea({ counter: { count: 'corrupted' } }));

    const result = await storage.get(schema, 'counter');

    expect(isErr(result) && result.error.code).toBe('STORAGE_VALIDATION_FAILED');
  });

  it('wraps a rejected get() in a STORAGE_READ_FAILED error', async () => {
    const area = createFakeArea();
    area.get = () => Promise.reject(new Error('disk on fire'));
    const storage = createChromeStorageAdapter(area);

    const result = await storage.get(schema, 'counter');

    expect(isErr(result) && result.error.code).toBe('STORAGE_READ_FAILED');
  });
});

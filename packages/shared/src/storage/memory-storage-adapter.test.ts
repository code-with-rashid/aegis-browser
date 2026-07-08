import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isErr, isOk } from '../result';
import { createMemoryStorage } from './memory-storage-adapter';

const schema = z.object({ count: z.number() });

describe('memory storage adapter', () => {
  it('returns undefined for a key that was never set', async () => {
    const storage = createMemoryStorage();
    const result = await storage.get(schema, 'missing');
    expect(isOk(result) && result.value).toBeUndefined();
  });

  it('round-trips a value through set() and get()', async () => {
    const storage = createMemoryStorage();

    const setResult = await storage.set(schema, 'counter', { count: 1 });
    expect(isOk(setResult)).toBe(true);

    const getResult = await storage.get(schema, 'counter');
    expect(isOk(getResult) && getResult.value).toEqual({ count: 1 });
  });

  it('removes a stored value', async () => {
    const storage = createMemoryStorage();
    await storage.set(schema, 'counter', { count: 1 });

    await storage.remove('counter');

    const result = await storage.get(schema, 'counter');
    expect(isOk(result) && result.value).toBeUndefined();
  });

  it('rejects a write that fails schema validation', async () => {
    const storage = createMemoryStorage();

    // @ts-expect-error -- intentionally invalid to exercise the validation failure path
    const result = await storage.set(schema, 'counter', { count: 'not a number' });

    expect(isErr(result) && result.error.code).toBe('STORAGE_VALIDATION_FAILED');
  });

  it('surfaces a validation error when a stored value no longer matches the schema', async () => {
    const storage = createMemoryStorage();
    const looseSchema = z.object({ count: z.unknown() });
    await storage.set(looseSchema, 'counter', { count: 'corrupted' });

    const result = await storage.get(schema, 'counter');

    expect(isErr(result) && result.error.code).toBe('STORAGE_VALIDATION_FAILED');
  });
});

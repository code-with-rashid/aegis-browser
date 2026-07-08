import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isOk } from '../result';
import { createMemoryStorage } from './memory-storage-adapter';
import { createNamespacedStorage } from './namespaced-storage';

const schema = z.string();

describe('namespaced storage', () => {
  it('prefixes keys so two namespaces cannot collide', async () => {
    const base = createMemoryStorage();
    const a = createNamespacedStorage(base, 'a');
    const b = createNamespacedStorage(base, 'b');

    await a.set(schema, 'key', 'from-a');
    await b.set(schema, 'key', 'from-b');

    const resultA = await a.get(schema, 'key');
    const resultB = await b.get(schema, 'key');

    expect(isOk(resultA) && resultA.value).toBe('from-a');
    expect(isOk(resultB) && resultB.value).toBe('from-b');
  });

  it('removes only the namespaced key', async () => {
    const base = createMemoryStorage();
    const a = createNamespacedStorage(base, 'a');
    const b = createNamespacedStorage(base, 'b');
    await a.set(schema, 'key', 'from-a');
    await b.set(schema, 'key', 'from-b');

    await a.remove('key');

    const resultA = await a.get(schema, 'key');
    const resultB = await b.get(schema, 'key');
    expect(isOk(resultA) && resultA.value).toBeUndefined();
    expect(isOk(resultB) && resultB.value).toBe('from-b');
  });
});

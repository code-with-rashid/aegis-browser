import { createMemoryStorage } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createPolicyStore } from './policy-store';
import type { SitePolicy } from './site-policy';

function unwrap<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value as T;
}

describe('createPolicyStore', () => {
  it('returns undefined for an origin with no stored policy', async () => {
    const store = createPolicyStore(createMemoryStorage());
    expect(unwrap(await store.getPolicy('https://example.com'))).toBeUndefined();
  });

  it('round-trips a set policy', async () => {
    const store = createPolicyStore(createMemoryStorage());
    const policy: SitePolicy = {
      origin: 'https://example.com',
      mode: 'allow',
      allowStateChanging: true,
    };

    expect((await store.setPolicy(policy)).ok).toBe(true);
    expect(unwrap(await store.getPolicy('https://example.com'))).toEqual(policy);
  });

  it('keeps policies for different origins independent', async () => {
    const store = createPolicyStore(createMemoryStorage());
    const a: SitePolicy = {
      origin: 'https://a.example.com',
      mode: 'allow',
      allowStateChanging: false,
    };
    const b: SitePolicy = {
      origin: 'https://b.example.com',
      mode: 'deny',
      allowStateChanging: false,
    };

    await store.setPolicy(a);
    await store.setPolicy(b);

    expect(unwrap(await store.getPolicy('https://a.example.com'))).toEqual(a);
    expect(unwrap(await store.getPolicy('https://b.example.com'))).toEqual(b);
  });

  it('overwrites a policy set again for the same origin', async () => {
    const store = createPolicyStore(createMemoryStorage());
    const origin = 'https://example.com';
    await store.setPolicy({ origin, mode: 'ask', allowStateChanging: false });
    await store.setPolicy({ origin, mode: 'deny', allowStateChanging: false });

    expect(unwrap(await store.getPolicy(origin))).toEqual({
      origin,
      mode: 'deny',
      allowStateChanging: false,
    });
  });

  it('removes a policy', async () => {
    const store = createPolicyStore(createMemoryStorage());
    const origin = 'https://example.com';
    await store.setPolicy({ origin, mode: 'allow', allowStateChanging: false });

    expect((await store.removePolicy(origin)).ok).toBe(true);
    expect(unwrap(await store.getPolicy(origin))).toBeUndefined();
  });

  it('removing a never-set origin is a no-op that still succeeds', async () => {
    const store = createPolicyStore(createMemoryStorage());
    expect((await store.removePolicy('https://example.com')).ok).toBe(true);
  });

  it('lists every stored policy', async () => {
    const store = createPolicyStore(createMemoryStorage());
    const a: SitePolicy = {
      origin: 'https://a.example.com',
      mode: 'allow',
      allowStateChanging: false,
    };
    const b: SitePolicy = {
      origin: 'https://b.example.com',
      mode: 'deny',
      allowStateChanging: false,
    };
    await store.setPolicy(a);
    await store.setPolicy(b);

    const listed = unwrap(await store.listPolicies());
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining([a, b]));
  });

  it('lists an empty array when nothing is stored', async () => {
    const store = createPolicyStore(createMemoryStorage());
    expect(unwrap(await store.listPolicies())).toEqual([]);
  });
});

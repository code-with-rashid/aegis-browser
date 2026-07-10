import { createMemoryStorage } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createPolicyEngine } from './policy-engine';
import { createPolicyStore } from './policy-store';

describe('createPolicyEngine', () => {
  it('confirms a state-changing risk by default when no policy is configured', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));

    const result = await engine.evaluate('state_changing', 'https://example.com');

    expect(result).toEqual({ ok: true, value: 'confirm' });
  });

  it('allows a state-changing risk once the origin opts in', async () => {
    const store = createPolicyStore(createMemoryStorage());
    await store.setPolicy({
      origin: 'https://example.com',
      mode: 'allow',
      allowStateChanging: true,
    });
    const engine = createPolicyEngine(store);

    const result = await engine.evaluate('state_changing', 'https://example.com');

    expect(result).toEqual({ ok: true, value: 'allow' });
  });

  it('denies every risk on a hard deny-listed origin by default', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));

    const result = await engine.evaluate('read', 'https://www.chase.com');

    expect(result).toEqual({ ok: true, value: 'deny' });
  });

  it('allows a read risk with no configured policy', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));

    const result = await engine.evaluate('read', 'https://example.com');

    expect(result).toEqual({ ok: true, value: 'allow' });
  });
});

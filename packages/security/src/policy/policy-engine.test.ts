import { createMemoryStorage, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createPolicyEngine } from './policy-engine';
import { createPolicyStore } from './policy-store';

describe('createPolicyEngine', () => {
  it('confirms a state-changing action by default when no policy is configured', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const click = { type: 'click' as const, ref: toElementRef('e1') };

    const result = await engine.evaluate(click, 'https://example.com', {
      elementName: 'Submit Order',
    });

    expect(result).toEqual({ ok: true, value: 'confirm' });
  });

  it('allows a state-changing action once the origin opts in', async () => {
    const store = createPolicyStore(createMemoryStorage());
    await store.setPolicy({
      origin: 'https://example.com',
      mode: 'allow',
      allowStateChanging: true,
    });
    const engine = createPolicyEngine(store);
    const click = { type: 'click' as const, ref: toElementRef('e1') };

    const result = await engine.evaluate(click, 'https://example.com', {
      elementName: 'Submit Order',
    });

    expect(result).toEqual({ ok: true, value: 'allow' });
  });

  it('denies every action on a hard deny-listed origin by default', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const extract = { type: 'extract' as const, instructions: 'get balance' };

    const result = await engine.evaluate(extract, 'https://www.chase.com');

    expect(result).toEqual({ ok: true, value: 'deny' });
  });

  it('allows a read action with no configured policy', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const extract = { type: 'extract' as const, instructions: 'get title' };

    const result = await engine.evaluate(extract, 'https://example.com');

    expect(result).toEqual({ ok: true, value: 'allow' });
  });
});

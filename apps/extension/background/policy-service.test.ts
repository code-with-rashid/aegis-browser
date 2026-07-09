import { AgentError } from '@aegis/agent';
import type { PerceptionPayload } from '@aegis/perception';
import {
  createPolicyEngine,
  createPolicyStore,
  type PolicyDecision,
  type PolicyEngine,
} from '@aegis/security';
import { createMemoryStorage, err, ok, StorageError, toElementRef } from '@aegis/shared';
import { describe, expect, it, vi } from 'vitest';

import { createPolicyService } from './policy-service';

const click = { type: 'click' as const, ref: toElementRef('e1') };
const goBack = { type: 'go_back' as const };

function perceptionWithElement(name: string): PerceptionPayload {
  return {
    elements: [{ ref: toElementRef('e1'), role: 'button', name, state: {}, source: 'ax' }],
    content: { text: '', truncated: false },
    tokenEstimate: 0,
    truncated: false,
  };
}

function fakeEngine(decisionFor: (index: number) => PolicyDecision): PolicyEngine {
  let calls = 0;
  return {
    evaluate: () => Promise.resolve(ok(decisionFor(calls++))),
  };
}

function originOf(url: string) {
  return () => Promise.resolve(url);
}

describe('createPolicyService', () => {
  it('allows a batch when every action is allowed', async () => {
    const checkPolicy = createPolicyService(
      fakeEngine(() => 'allow'),
      originOf('https://example.com'),
    );

    const result = await checkPolicy({ actions: [click, goBack] });

    expect(result).toEqual({ ok: true, value: { decision: 'allow' } });
  });

  it('confirms when any single action needs confirmation', async () => {
    const checkPolicy = createPolicyService(
      fakeEngine(() => 'confirm'),
      originOf('https://example.com'),
    );

    const result = await checkPolicy({ actions: [click] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('confirm');
    expect(result.ok && result.value.reason).toContain('example.com');
  });

  it('denies the whole batch when any action is denied, even if it comes after a confirm', async () => {
    const decisions: PolicyDecision[] = ['confirm', 'deny'];
    const checkPolicy = createPolicyService(
      fakeEngine((index) => decisions[index] ?? 'allow'),
      originOf('https://www.chase.com'),
    );

    const result = await checkPolicy({ actions: [click, goBack] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('deny');
  });

  it('denies the whole batch when a deny comes before a confirm', async () => {
    const decisions: PolicyDecision[] = ['deny', 'confirm'];
    const checkPolicy = createPolicyService(
      fakeEngine((index) => decisions[index] ?? 'allow'),
      originOf('https://www.chase.com'),
    );

    const result = await checkPolicy({ actions: [click, goBack] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('deny');
  });

  it('fails with POLICY_CHECK_FAILED when the engine errors', async () => {
    const engine: PolicyEngine = {
      evaluate: () => Promise.resolve(err(new StorageError('STORAGE_READ_FAILED', 'boom'))),
    };
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'));

    const result = await checkPolicy({ actions: [click] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBeInstanceOf(AgentError);
    expect(!result.ok && result.error.code).toBe('POLICY_CHECK_FAILED');
  });

  it('fails with POLICY_CHECK_FAILED when origin resolution throws', async () => {
    const checkPolicy = createPolicyService(
      fakeEngine(() => 'allow'),
      () => {
        throw new Error('no active tab');
      },
    );

    const result = await checkPolicy({ actions: [click] });

    expect(!result.ok && result.error.code).toBe('POLICY_CHECK_FAILED');
  });

  it('integrates with a real PolicyEngine: a deny-listed origin denies by default', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const checkPolicy = createPolicyService(engine, originOf('https://www.chase.com'));

    const result = await checkPolicy({ actions: [goBack] });

    expect(result).toEqual({
      ok: true,
      value: { decision: 'deny', reason: 'https://www.chase.com denies this action' },
    });
  });

  it('integrates with a real PolicyEngine: an ordinary origin with no configured policy allows a read action', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'));

    const result = await checkPolicy({ actions: [goBack] });

    expect(result).toEqual({ ok: true, value: { decision: 'allow' } });
  });

  it('passes the target element accessible name from perception as riskContext', async () => {
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const checkPolicy = createPolicyService({ evaluate }, originOf('https://example.com'));

    await checkPolicy({ actions: [click], perception: perceptionWithElement('Buy Now') });

    expect(evaluate).toHaveBeenCalledWith(click, 'https://example.com', {
      elementName: 'Buy Now',
    });
  });

  it('passes no riskContext when no perception is given', async () => {
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const checkPolicy = createPolicyService({ evaluate }, originOf('https://example.com'));

    await checkPolicy({ actions: [click] });

    expect(evaluate).toHaveBeenCalledWith(click, 'https://example.com', undefined);
  });

  it('passes no riskContext when perception has no element matching the ref', async () => {
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const checkPolicy = createPolicyService({ evaluate }, originOf('https://example.com'));
    const perception: PerceptionPayload = {
      elements: [],
      content: { text: '', truncated: false },
      tokenEstimate: 0,
      truncated: false,
    };

    await checkPolicy({ actions: [click], perception });

    expect(evaluate).toHaveBeenCalledWith(click, 'https://example.com', undefined);
  });

  it('integrates with a real PolicyEngine: a click on a button named "Buy Now" requires confirmation', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'));

    const result = await checkPolicy({
      actions: [click],
      perception: perceptionWithElement('Buy Now'),
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('confirm');
  });

  it('integrates with a real PolicyEngine: the same click on a button named "Details" is allowed', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'));

    const result = await checkPolicy({
      actions: [click],
      perception: perceptionWithElement('Details'),
    });

    expect(result).toEqual({ ok: true, value: { decision: 'allow' } });
  });

  it('checks a navigate action against its destination origin, not the current page', async () => {
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const navigate = { type: 'navigate' as const, url: 'https://www.chase.com/login' };
    const checkPolicy = createPolicyService({ evaluate }, originOf('https://example.com'));

    await checkPolicy({ actions: [navigate] });

    expect(evaluate).toHaveBeenCalledWith(navigate, 'https://www.chase.com', undefined);
  });

  it('integrates with a real PolicyEngine: navigating to a deny-listed destination is denied, even from a safe origin', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const navigate = { type: 'navigate' as const, url: 'https://www.chase.com/login' };
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'));

    const result = await checkPolicy({ actions: [navigate] });

    expect(result).toEqual({
      ok: true,
      value: { decision: 'deny', reason: 'https://www.chase.com denies this action' },
    });
  });

  it('integrates with a real PolicyEngine: opening a new tab at a deny-listed URL is denied', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const openTab = { type: 'open_tab' as const, url: 'https://www.chase.com/login' };
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'));

    const result = await checkPolicy({ actions: [openTab] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('deny');
  });

  it('checks a click action against the current origin, unaffected by the navigate-destination logic', async () => {
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const checkPolicy = createPolicyService({ evaluate }, originOf('https://example.com'));

    await checkPolicy({ actions: [click] });

    expect(evaluate).toHaveBeenCalledWith(click, 'https://example.com', undefined);
  });

  it('falls back to the current origin for a navigate action with an unparseable URL', async () => {
    // NavigateActionSchema already requires a valid URL, but the fallback must still be
    // safe (deny nothing spuriously) if one somehow arrives malformed.
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const navigate = { type: 'navigate' as const, url: 'not-a-valid-url' };
    const checkPolicy = createPolicyService({ evaluate }, originOf('https://example.com'));

    await checkPolicy({ actions: [navigate] });

    expect(evaluate).toHaveBeenCalledWith(navigate, 'https://example.com', undefined);
  });
});

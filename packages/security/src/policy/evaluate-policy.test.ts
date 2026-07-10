import { describe, expect, it } from 'vitest';

import type { ActionRisk } from '@aegis/actions';

import { decideForRisk, evaluatePolicy, resolveEffectiveMode } from './evaluate-policy';
import type { PolicyMode, SitePolicy } from './site-policy';

const RISKS: readonly ActionRisk[] = ['read', 'navigate', 'input', 'state_changing'];
const MODES: readonly PolicyMode[] = ['ask', 'allow', 'deny'];

describe('decideForRisk (exhaustive risk x mode x allowStateChanging matrix)', () => {
  it.each(
    RISKS.flatMap((risk) =>
      MODES.flatMap((mode) =>
        [true, false].map((allowStateChanging) => [risk, mode, allowStateChanging] as const),
      ),
    ),
  )('risk=%s mode=%s allowStateChanging=%s', (risk, mode, allowStateChanging) => {
    const decision = decideForRisk(risk, mode, allowStateChanging);

    if (mode === 'deny') {
      expect(decision).toBe('deny');
      return;
    }
    if (risk === 'read') {
      expect(decision).toBe('allow');
      return;
    }
    if (risk === 'state_changing') {
      expect(decision).toBe(mode === 'allow' && allowStateChanging ? 'allow' : 'confirm');
      return;
    }
    // navigate | input
    expect(decision).toBe('allow');
  });
});

describe('resolveEffectiveMode', () => {
  const now = 1_000_000;

  it('defaults to "ask" for an origin with no stored policy and not deny-listed', () => {
    expect(resolveEffectiveMode('https://example.com', undefined, now)).toBe('ask');
  });

  it('uses the stored policy mode when present and not expired', () => {
    const policy: SitePolicy = {
      origin: 'https://example.com',
      mode: 'allow',
      allowStateChanging: false,
    };
    expect(resolveEffectiveMode('https://example.com', policy, now)).toBe('allow');
  });

  it('falls back to "ask" when the stored policy has expired', () => {
    const policy: SitePolicy = {
      origin: 'https://example.com',
      mode: 'allow',
      allowStateChanging: false,
      expiresAt: now - 1,
    };
    expect(resolveEffectiveMode('https://example.com', policy, now)).toBe('ask');
  });

  it('treats an unexpired session policy as active', () => {
    const policy: SitePolicy = {
      origin: 'https://example.com',
      mode: 'deny',
      allowStateChanging: false,
      expiresAt: now + 1,
    };
    expect(resolveEffectiveMode('https://example.com', policy, now)).toBe('deny');
  });

  it('hard deny-lists a banking origin with no stored policy', () => {
    expect(resolveEffectiveMode('https://www.chase.com', undefined, now)).toBe('deny');
  });

  it('hard deny-lists a government origin', () => {
    expect(resolveEffectiveMode('https://www.irs.gov', undefined, now)).toBe('deny');
  });

  it('deny-list wins over an explicit "ask" policy on the same origin', () => {
    const policy: SitePolicy = {
      origin: 'https://www.chase.com',
      mode: 'ask',
      allowStateChanging: false,
    };
    expect(resolveEffectiveMode('https://www.chase.com', policy, now)).toBe('deny');
  });

  it('deny-list wins over an explicit "deny" policy on the same origin (redundant but consistent)', () => {
    const policy: SitePolicy = {
      origin: 'https://www.chase.com',
      mode: 'deny',
      allowStateChanging: false,
    };
    expect(resolveEffectiveMode('https://www.chase.com', policy, now)).toBe('deny');
  });

  it('an explicit "allow" policy opts out of the deny-list', () => {
    const policy: SitePolicy = {
      origin: 'https://www.chase.com',
      mode: 'allow',
      allowStateChanging: false,
    };
    expect(resolveEffectiveMode('https://www.chase.com', policy, now)).toBe('allow');
  });

  it('an expired "allow" opt-in no longer overrides the deny-list', () => {
    const policy: SitePolicy = {
      origin: 'https://www.chase.com',
      mode: 'allow',
      allowStateChanging: false,
      expiresAt: now - 1,
    };
    expect(resolveEffectiveMode('https://www.chase.com', policy, now)).toBe('deny');
  });

  it('accepts a custom deny-list override', () => {
    expect(resolveEffectiveMode('https://example.com', undefined, now, ['example.com'])).toBe(
      'deny',
    );
    expect(resolveEffectiveMode('https://www.chase.com', undefined, now, ['example.com'])).toBe(
      'ask',
    );
  });
});

describe('evaluatePolicy', () => {
  const now = 1_000_000;

  it('allows a read risk with no configured policy', () => {
    expect(evaluatePolicy({ risk: 'read', origin: 'https://example.com', now })).toBe('allow');
  });

  it('confirms a state-changing risk by default (ask mode, no policy)', () => {
    expect(evaluatePolicy({ risk: 'state_changing', origin: 'https://example.com', now })).toBe(
      'confirm',
    );
  });

  it('allows a state-changing risk when explicitly opted in', () => {
    const policy: SitePolicy = {
      origin: 'https://example.com',
      mode: 'allow',
      allowStateChanging: true,
    };
    expect(
      evaluatePolicy({ risk: 'state_changing', origin: 'https://example.com', policy, now }),
    ).toBe('allow');
  });

  it('denies everything on a hard deny-listed origin, including reads', () => {
    expect(evaluatePolicy({ risk: 'read', origin: 'https://www.chase.com', now })).toBe('deny');
  });

  it('denies a plain input risk on a deny-listed origin even without a state-changing signal', () => {
    expect(evaluatePolicy({ risk: 'input', origin: 'https://www.chase.com', now })).toBe('deny');
  });
});

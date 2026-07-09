import { describe, expect, it } from 'vitest';

import { normalizeOrigin, toSitePolicy } from './site-policy-draft';
import type { SitePolicyDraft } from './site-policy-draft';

describe('normalizeOrigin', () => {
  it('extracts scheme + host, dropping path/query', () => {
    expect(normalizeOrigin('https://example.com/some/path?x=1')).toBe('https://example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeOrigin('  https://example.com  ')).toBe('https://example.com');
  });

  it('returns undefined for an unparseable input', () => {
    expect(normalizeOrigin('not a url')).toBeUndefined();
  });

  it('returns undefined for an empty input', () => {
    expect(normalizeOrigin('')).toBeUndefined();
  });
});

describe('toSitePolicy', () => {
  it('builds a valid SitePolicy from a valid draft', () => {
    const draft: SitePolicyDraft = {
      origin: 'https://example.com',
      mode: 'allow',
      allowStateChanging: true,
    };
    expect(toSitePolicy(draft)).toEqual({
      origin: 'https://example.com',
      mode: 'allow',
      allowStateChanging: true,
    });
  });

  it('normalizes the origin before validating', () => {
    const draft: SitePolicyDraft = {
      origin: 'https://example.com/dashboard',
      mode: 'ask',
      allowStateChanging: false,
    };
    expect(toSitePolicy(draft)?.origin).toBe('https://example.com');
  });

  it('returns undefined when the origin does not parse', () => {
    const draft: SitePolicyDraft = { origin: 'nonsense', mode: 'ask', allowStateChanging: false };
    expect(toSitePolicy(draft)).toBeUndefined();
  });
});

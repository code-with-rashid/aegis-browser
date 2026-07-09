import { describe, expect, it } from 'vitest';

import { isPolicyExpired, SitePolicySchema, type SitePolicy } from './site-policy';

describe('SitePolicySchema', () => {
  it('accepts a policy without expiresAt', () => {
    const result = SitePolicySchema.safeParse({
      origin: 'https://example.com',
      mode: 'ask',
      allowStateChanging: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a policy with expiresAt', () => {
    const result = SitePolicySchema.safeParse({
      origin: 'https://example.com',
      mode: 'allow',
      allowStateChanging: true,
      expiresAt: 123,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid mode', () => {
    const result = SitePolicySchema.safeParse({
      origin: 'https://example.com',
      mode: 'sometimes',
      allowStateChanging: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty origin', () => {
    const result = SitePolicySchema.safeParse({
      origin: '',
      mode: 'ask',
      allowStateChanging: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('isPolicyExpired', () => {
  const base: SitePolicy = {
    origin: 'https://example.com',
    mode: 'allow',
    allowStateChanging: true,
  };

  it('is false when expiresAt is unset', () => {
    expect(isPolicyExpired(base, Date.now())).toBe(false);
  });

  it('is false when expiresAt is in the future', () => {
    expect(isPolicyExpired({ ...base, expiresAt: 2_000 }, 1_000)).toBe(false);
  });

  it('is true when expiresAt is in the past', () => {
    expect(isPolicyExpired({ ...base, expiresAt: 1_000 }, 2_000)).toBe(true);
  });

  it('is true when expiresAt equals now', () => {
    expect(isPolicyExpired({ ...base, expiresAt: 1_000 }, 1_000)).toBe(true);
  });
});

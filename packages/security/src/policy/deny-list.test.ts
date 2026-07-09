import { describe, expect, it } from 'vitest';

import { DEFAULT_DENY_LIST_HOST_SUFFIXES, isDenyListedOrigin } from './deny-list';

describe('isDenyListedOrigin', () => {
  it('matches an exact banking hostname', () => {
    expect(isDenyListedOrigin('https://chase.com')).toBe(true);
  });

  it('matches a subdomain of a banking hostname', () => {
    expect(isDenyListedOrigin('https://secure.chase.com')).toBe(true);
  });

  it('matches a .gov TLD', () => {
    expect(isDenyListedOrigin('https://www.irs.gov')).toBe(true);
  });

  it('matches a .mil TLD', () => {
    expect(isDenyListedOrigin('https://www.army.mil')).toBe(true);
  });

  it('matches an adult content hostname', () => {
    expect(isDenyListedOrigin('https://onlyfans.com')).toBe(true);
  });

  it('does not match an unrelated origin', () => {
    expect(isDenyListedOrigin('https://example.com')).toBe(false);
  });

  it('does not false-positive on a hostname that merely contains a deny-listed word', () => {
    expect(isDenyListedOrigin('https://notchase.com')).toBe(false);
  });

  it('returns false for an unparseable origin instead of throwing', () => {
    expect(isDenyListedOrigin('not a url')).toBe(false);
  });

  it('accepts a custom deny-list', () => {
    expect(isDenyListedOrigin('https://internal.example.com', ['example.com'])).toBe(true);
    expect(isDenyListedOrigin('https://chase.com', ['example.com'])).toBe(false);
  });

  it('exports a non-empty default deny-list', () => {
    expect(DEFAULT_DENY_LIST_HOST_SUFFIXES.length).toBeGreaterThan(0);
  });
});

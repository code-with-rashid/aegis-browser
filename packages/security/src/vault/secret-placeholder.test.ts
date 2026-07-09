import { describe, expect, it } from 'vitest';

import { findSecretPlaceholderNames, toSecretPlaceholder } from './secret-placeholder';

describe('toSecretPlaceholder', () => {
  it('wraps the secret name in angle-quote guillemets with a secret: prefix', () => {
    expect(toSecretPlaceholder('github_password')).toBe('‹secret:github_password›');
  });
});

describe('findSecretPlaceholderNames', () => {
  it('finds a single placeholder', () => {
    const text = `Password: ${toSecretPlaceholder('github_password')}`;
    expect(findSecretPlaceholderNames(text)).toEqual(['github_password']);
  });

  it('finds multiple distinct placeholders in order', () => {
    const text = `${toSecretPlaceholder('username')} / ${toSecretPlaceholder('password')}`;
    expect(findSecretPlaceholderNames(text)).toEqual(['username', 'password']);
  });

  it('deduplicates repeated placeholders', () => {
    const text = `${toSecretPlaceholder('api_key')} ... ${toSecretPlaceholder('api_key')}`;
    expect(findSecretPlaceholderNames(text)).toEqual(['api_key']);
  });

  it('returns an empty array when there is no placeholder', () => {
    expect(findSecretPlaceholderNames('just ordinary text')).toEqual([]);
  });

  it('does not match a bare secret: mention without the guillemets', () => {
    expect(findSecretPlaceholderNames('secret:github_password')).toEqual([]);
  });
});

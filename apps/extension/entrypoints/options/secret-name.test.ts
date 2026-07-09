import { describe, expect, it } from 'vitest';

import { isValidSecretName } from './secret-name';

describe('isValidSecretName', () => {
  it('accepts letters, digits, underscore, and hyphen', () => {
    expect(isValidSecretName('github_password-1')).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(isValidSecretName('')).toBe(false);
  });

  it('rejects whitespace', () => {
    expect(isValidSecretName('github password')).toBe(false);
  });

  it('rejects the placeholder delimiter characters', () => {
    expect(isValidSecretName('secret:name›')).toBe(false);
  });
});

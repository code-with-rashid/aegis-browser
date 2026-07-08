import { describe, expect, it } from 'vitest';

import { perceivedElement } from './perceived-element-test-helpers';
import { estimateElementTokens, estimateTokens } from './token-estimate';

describe('estimateTokens', () => {
  it('returns 0 for an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates roughly one token per 4 characters, rounding up', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('is deterministic for the same input', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    expect(estimateTokens(text)).toBe(estimateTokens(text));
  });
});

describe('estimateElementTokens', () => {
  it('scales with the amount of text in the element', () => {
    const short = perceivedElement({ ref: 'e1', name: 'Go' });
    const long = perceivedElement({
      ref: 'e2',
      name: 'A much longer button label describing the action in detail',
    });

    expect(estimateElementTokens(long)).toBeGreaterThan(estimateElementTokens(short));
  });
});

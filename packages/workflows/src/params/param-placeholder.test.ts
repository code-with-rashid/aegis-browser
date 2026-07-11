import { describe, expect, it } from 'vitest';

import { findParamPlaceholderNames, toParamPlaceholder } from './param-placeholder';

describe('toParamPlaceholder', () => {
  it('wraps a name in the guillemet-delimited param token', () => {
    expect(toParamPlaceholder('search_term')).toBe('‹param:search_term›');
  });
});

describe('findParamPlaceholderNames', () => {
  it('finds a single placeholder name', () => {
    expect(findParamPlaceholderNames(toParamPlaceholder('search_term'))).toEqual(['search_term']);
  });

  it('finds a placeholder embedded within a larger string', () => {
    const text = `Search for ${toParamPlaceholder('query')} on the site`;
    expect(findParamPlaceholderNames(text)).toEqual(['query']);
  });

  it('finds multiple distinct placeholders in first-seen order', () => {
    const text = `${toParamPlaceholder('b')} then ${toParamPlaceholder('a')} then ${toParamPlaceholder('b')}`;
    expect(findParamPlaceholderNames(text)).toEqual(['b', 'a']);
  });

  it('returns an empty array when there is no placeholder', () => {
    expect(findParamPlaceholderNames('plain text, nothing to see')).toEqual([]);
  });
});

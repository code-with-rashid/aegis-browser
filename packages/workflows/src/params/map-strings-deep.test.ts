import { describe, expect, it } from 'vitest';

import { mapStringsDeep } from './map-strings-deep';

describe('mapStringsDeep', () => {
  it('maps a bare string', () => {
    expect(mapStringsDeep('hello', (text) => text.toUpperCase())).toBe('HELLO');
  });

  it('maps every string value in a nested object', () => {
    const input = { type: 'input_text', text: 'oat milk', nested: { label: 'search' } };
    const result = mapStringsDeep(input, (text) => text.toUpperCase());
    expect(result).toEqual({ type: 'INPUT_TEXT', text: 'OAT MILK', nested: { label: 'SEARCH' } });
  });

  it('maps every string value inside an array', () => {
    const result = mapStringsDeep(['a', 'b', { c: 'd' }], (text) => text.toUpperCase());
    expect(result).toEqual(['A', 'B', { c: 'D' }]);
  });

  it('leaves numbers, booleans, and null untouched', () => {
    const input = { count: 3, enabled: true, missing: null };
    const result = mapStringsDeep(input, (text) => text.toUpperCase());
    expect(result).toEqual({ count: 3, enabled: true, missing: null });
  });

  it('leaves undefined untouched', () => {
    expect(mapStringsDeep(undefined, (text) => text.toUpperCase())).toBeUndefined();
  });
});

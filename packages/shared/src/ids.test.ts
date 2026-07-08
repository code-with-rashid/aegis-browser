import { describe, expect, it } from 'vitest';

import { toElementRef, toTaskId } from './ids';

describe('branded ids', () => {
  it('toTaskId() preserves the underlying string value', () => {
    expect(toTaskId('task-1')).toBe('task-1');
  });

  it('toElementRef() preserves the underlying string value', () => {
    expect(toElementRef('ref-1')).toBe('ref-1');
  });
});

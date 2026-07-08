import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index';

describe('@aegis/mcp', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@aegis/mcp');
  });
});

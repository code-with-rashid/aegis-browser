import { describe, expect, it } from 'vitest';

import { wrapUntrustedContent } from './wrap-untrusted-content';

describe('wrapUntrustedContent', () => {
  it('wraps text in an untrusted-page-content envelope', () => {
    expect(wrapUntrustedContent('some page text')).toBe(
      '<untrusted-page-content>\nsome page text\n</untrusted-page-content>',
    );
  });

  it('wraps empty content too', () => {
    expect(wrapUntrustedContent('')).toBe('<untrusted-page-content>\n\n</untrusted-page-content>');
  });
});

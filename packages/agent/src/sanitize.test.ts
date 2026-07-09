import { describe, expect, it } from 'vitest';

import { identitySanitize, wrapUntrustedContent } from './sanitize';

describe('identitySanitize', () => {
  it('returns the input unchanged', () => {
    expect(identitySanitize('hello <script>alert(1)</script>')).toBe(
      'hello <script>alert(1)</script>',
    );
  });
});

describe('wrapUntrustedContent', () => {
  it('wraps text in an untrusted-page-content envelope', () => {
    expect(wrapUntrustedContent('some page text')).toBe(
      '<untrusted-page-content>\nsome page text\n</untrusted-page-content>',
    );
  });
});

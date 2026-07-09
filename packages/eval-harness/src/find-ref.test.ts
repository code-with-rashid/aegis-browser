import { describe, expect, it } from 'vitest';

import { findRef } from './find-ref';

const PROMPT = [
  'Sub-goal: Click the button',
  '',
  'Available elements (use these refs verbatim):',
  '- [ax:1] button "Reveal Plan B price"',
  '- [ax:2] textbox "Access code"',
  '- [ax:3] button "Enter"',
].join('\n');

describe('findRef', () => {
  it('finds the ref for an element whose name contains the substring', () => {
    expect(findRef(PROMPT, 'Reveal Plan B price')).toBe('ax:1');
  });

  it('matches case-insensitively', () => {
    expect(findRef(PROMPT, 'access code')).toBe('ax:2');
  });

  it('matches a partial substring', () => {
    expect(findRef(PROMPT, 'Enter')).toBe('ax:3');
  });

  it('throws when no element matches', () => {
    expect(() => findRef(PROMPT, 'Nonexistent Button')).toThrow(/No element matching/);
  });
});

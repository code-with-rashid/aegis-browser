import { describe, expect, it } from 'vitest';

import { parseKeyCombo } from './key-map';

describe('parseKeyCombo', () => {
  it('parses a bare named key with no modifiers', () => {
    expect(parseKeyCombo('Enter')).toEqual({
      modifiers: 0,
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
  });

  it('is case-insensitive for named keys', () => {
    expect(parseKeyCombo('tab').code).toBe('Tab');
    expect(parseKeyCombo('ARROWDOWN').code).toBe('ArrowDown');
  });

  it('parses a single modifier + named key combo', () => {
    const combo = parseKeyCombo('Shift+Tab');
    expect(combo).toEqual({ modifiers: 8, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  });

  it('combines multiple modifiers', () => {
    const combo = parseKeyCombo('Ctrl+Shift+Enter');
    expect(combo.modifiers).toBe(2 | 8);
  });

  it('parses a modifier + single character', () => {
    const combo = parseKeyCombo('Ctrl+A');
    expect(combo).toEqual({
      modifiers: 2,
      key: 'A',
      code: 'KeyA',
      windowsVirtualKeyCode: 'A'.charCodeAt(0),
    });
  });

  it('treats a bare single character as its own key', () => {
    const combo = parseKeyCombo('a');
    expect(combo.modifiers).toBe(0);
    expect(combo.code).toBe('KeyA');
  });

  it('falls back to the raw string for an unrecognized multi-character key', () => {
    const combo = parseKeyCombo('F13');
    expect(combo).toEqual({ modifiers: 0, key: 'F13', code: 'F13', windowsVirtualKeyCode: 0 });
  });

  it('accepts "control", "cmd", and "command" as modifier aliases', () => {
    expect(parseKeyCombo('Control+A').modifiers).toBe(2);
    expect(parseKeyCombo('Cmd+A').modifiers).toBe(4);
    expect(parseKeyCombo('Command+A').modifiers).toBe(4);
  });
});

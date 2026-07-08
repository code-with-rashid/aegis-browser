interface KeyDefinition {
  readonly key: string;
  readonly code: string;
  readonly windowsVirtualKeyCode: number;
}

const KEY_DEFINITIONS: Readonly<Record<string, KeyDefinition>> = {
  enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
  tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
  space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  home: { key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 },
  end: { key: 'End', code: 'End', windowsVirtualKeyCode: 35 },
};

const MODIFIER_BITS: Readonly<Record<string, number>> = {
  alt: 1,
  ctrl: 2,
  control: 2,
  meta: 4,
  cmd: 4,
  command: 4,
  shift: 8,
};

export interface ParsedKeyCombo {
  readonly modifiers: number;
  readonly key: string;
  readonly code: string;
  readonly windowsVirtualKeyCode: number;
}

/**
 * Parses a human-readable key combo like `"Enter"`, `"Ctrl+A"`, or `"Shift+Tab"` into
 * `Input.dispatchKeyEvent` params. Covers the keys automation actually needs (Enter,
 * Tab, arrows, Escape, Backspace/Delete, Home/End) plus any single character combined
 * with modifiers — not a full keyboard layout. An unrecognized multi-character key
 * falls back to using the raw string as both `key` and `code` (best-effort).
 */
export function parseKeyCombo(keys: string): ParsedKeyCombo {
  const parts = keys.split('+').map((part) => part.trim());
  const last = parts.at(-1) ?? keys;
  const modifierParts = parts.slice(0, -1);

  const modifiers = modifierParts.reduce(
    (bits, part) => bits | (MODIFIER_BITS[part.toLowerCase()] ?? 0),
    0,
  );

  const known = KEY_DEFINITIONS[last.toLowerCase()];
  if (known) {
    return { modifiers, ...known };
  }

  if (last.length === 1) {
    return {
      modifiers,
      key: last,
      code: `Key${last.toUpperCase()}`,
      windowsVirtualKeyCode: last.toUpperCase().charCodeAt(0),
    };
  }

  return { modifiers, key: last, code: last, windowsVirtualKeyCode: 0 };
}

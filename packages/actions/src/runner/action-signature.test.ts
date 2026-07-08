import { toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import type { Action } from '../schema';
import { actionSignature } from './action-signature';

const FIXTURES: readonly (readonly [Action, string])[] = [
  [{ type: 'click', ref: toElementRef('ax:1') }, 'click:ax:1'],
  [{ type: 'input_text', ref: toElementRef('ax:1'), text: 'hi' }, 'input_text:ax:1'],
  [{ type: 'get_dropdown_options', ref: toElementRef('ax:1') }, 'get_dropdown_options:ax:1'],
  [
    { type: 'select_dropdown_option', ref: toElementRef('ax:1'), value: 'x' },
    'select_dropdown_option:ax:1',
  ],
  [{ type: 'scroll', direction: 'down' }, 'scroll:'],
  [{ type: 'scroll', ref: toElementRef('ax:1'), direction: 'down' }, 'scroll:ax:1'],
  [{ type: 'send_keys', keys: 'Enter' }, 'send_keys:'],
  [{ type: 'navigate', url: 'https://example.com' }, 'navigate:https://example.com'],
  [{ type: 'open_tab' }, 'open_tab:'],
  [{ type: 'open_tab', url: 'https://example.com' }, 'open_tab:https://example.com'],
  [{ type: 'switch_tab', tabId: 3 }, 'switch_tab:3'],
  [{ type: 'close_tab' }, 'close_tab:'],
  [{ type: 'close_tab', tabId: 3 }, 'close_tab:3'],
  [{ type: 'go_back' }, 'go_back'],
  [{ type: 'wait', ms: 100 }, 'wait'],
  [{ type: 'extract', instructions: 'x' }, 'extract'],
  [{ type: 'done', success: true, summary: 'ok' }, 'done'],
];

describe('actionSignature', () => {
  it.each(FIXTURES)('signs %o as %s', (action, expected) => {
    expect(actionSignature(action)).toBe(expected);
  });

  it('gives different refs different signatures', () => {
    const a = actionSignature({ type: 'click', ref: toElementRef('ax:1') });
    const b = actionSignature({ type: 'click', ref: toElementRef('ax:2') });
    expect(a).not.toBe(b);
  });
});

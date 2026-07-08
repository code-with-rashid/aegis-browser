import { describe, expect, it } from 'vitest';

import { ActionSchema } from './index';

describe('ActionSchema', () => {
  it.each([
    ['click', { type: 'click', ref: 'e1' }],
    ['input_text', { type: 'input_text', ref: 'e1', text: 'hello' }],
    ['scroll', { type: 'scroll', direction: 'down' }],
    ['scroll with ref+amount', { type: 'scroll', ref: 'e1', direction: 'up', amount: 100 }],
    ['navigate', { type: 'navigate', url: 'https://example.com' }],
    ['go_back', { type: 'go_back' }],
    ['open_tab', { type: 'open_tab' }],
    ['open_tab with url', { type: 'open_tab', url: 'https://example.com' }],
    ['switch_tab', { type: 'switch_tab', tabId: 3 }],
    ['close_tab', { type: 'close_tab' }],
    ['close_tab with tabId', { type: 'close_tab', tabId: 3 }],
    ['get_dropdown_options', { type: 'get_dropdown_options', ref: 'e1' }],
    ['select_dropdown_option', { type: 'select_dropdown_option', ref: 'e1', value: 'opt-1' }],
    ['send_keys', { type: 'send_keys', keys: 'Enter' }],
    ['send_keys with ref', { type: 'send_keys', ref: 'e1', keys: 'Ctrl+A' }],
    ['wait', { type: 'wait', ms: 500 }],
    ['extract', { type: 'extract', instructions: 'Get the page title' }],
    ['done', { type: 'done', success: true, summary: 'Task complete' }],
  ])('accepts a valid %s fixture', (_name, fixture) => {
    const result = ActionSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it.each([
    ['click missing ref', { type: 'click' }],
    ['input_text missing text', { type: 'input_text', ref: 'e1' }],
    ['scroll invalid direction', { type: 'scroll', direction: 'sideways' }],
    ['scroll negative amount', { type: 'scroll', direction: 'down', amount: -5 }],
    ['navigate invalid url', { type: 'navigate', url: 'not-a-url' }],
    ['open_tab invalid url', { type: 'open_tab', url: 'not-a-url' }],
    ['switch_tab missing tabId', { type: 'switch_tab' }],
    ['switch_tab negative tabId', { type: 'switch_tab', tabId: -1 }],
    ['get_dropdown_options missing ref', { type: 'get_dropdown_options' }],
    ['select_dropdown_option missing value', { type: 'select_dropdown_option', ref: 'e1' }],
    ['send_keys empty keys', { type: 'send_keys', keys: '' }],
    ['wait zero ms', { type: 'wait', ms: 0 }],
    ['wait too large', { type: 'wait', ms: 999_999 }],
    ['extract empty instructions', { type: 'extract', instructions: '' }],
    ['done missing summary', { type: 'done', success: true }],
    ['unknown type', { type: 'teleport' }],
    ['missing type entirely', { ref: 'e1' }],
  ])('rejects an invalid fixture: %s', (_name, fixture) => {
    const result = ActionSchema.safeParse(fixture);
    expect(result.success).toBe(false);
  });

  it('brands a validated ref as an ElementRef', () => {
    const result = ActionSchema.safeParse({ type: 'click', ref: 'e1' });
    expect(result.success && result.data.type === 'click' && result.data.ref).toBe('e1');
  });
});

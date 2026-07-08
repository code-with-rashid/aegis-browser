import { toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { classifyActionRisk, elevateRisk } from './risk';
import type { Action } from './schema';

function action<T extends Action>(value: T): T {
  return value;
}

describe('classifyActionRisk', () => {
  it.each([
    ['click', action({ type: 'click', ref: toElementRef('e1') }), 'input'],
    ['input_text', action({ type: 'input_text', ref: toElementRef('e1'), text: 'hi' }), 'input'],
    ['scroll', action({ type: 'scroll', direction: 'down' }), 'input'],
    [
      'select_dropdown_option',
      action({ type: 'select_dropdown_option', ref: toElementRef('e1'), value: 'x' }),
      'input',
    ],
    ['send_keys', action({ type: 'send_keys', keys: 'Enter' }), 'input'],
    ['navigate', action({ type: 'navigate', url: 'https://example.com' }), 'navigate'],
    ['go_back', action({ type: 'go_back' }), 'navigate'],
    ['open_tab', action({ type: 'open_tab' }), 'navigate'],
    ['switch_tab', action({ type: 'switch_tab', tabId: 1 }), 'navigate'],
    ['close_tab', action({ type: 'close_tab' }), 'navigate'],
    [
      'get_dropdown_options',
      action({ type: 'get_dropdown_options', ref: toElementRef('e1') }),
      'read',
    ],
    ['wait', action({ type: 'wait', ms: 100 }), 'read'],
    ['extract', action({ type: 'extract', instructions: 'get title' }), 'read'],
    ['done', action({ type: 'done', success: true, summary: 'ok' }), 'read'],
  ])('classifies %s as %s by default', (_name, fixture, expected) => {
    expect(classifyActionRisk(fixture)).toBe(expected);
  });

  it('elevates a click to state_changing when the target name matches a signal keyword', () => {
    const click = action({ type: 'click', ref: toElementRef('e1') });
    expect(classifyActionRisk(click, { elementName: 'Submit Order' })).toBe('state_changing');
  });

  it('does not elevate a click whose target name has no signal keyword', () => {
    const click = action({ type: 'click', ref: toElementRef('e1') });
    expect(classifyActionRisk(click, { elementName: 'Read more' })).toBe('input');
  });

  it('elevates input_text into a field whose label suggests a credential', () => {
    const input = action({ type: 'input_text', ref: toElementRef('e1'), text: '1234' });
    expect(classifyActionRisk(input, { elementName: 'Card number' })).toBe('state_changing');
  });

  it('is case-insensitive when matching keywords', () => {
    const click = action({ type: 'click', ref: toElementRef('e1') });
    expect(classifyActionRisk(click, { elementName: 'SUBMIT ORDER' })).toBe('state_changing');
  });

  it('never elevates a navigate action regardless of context', () => {
    const navigate = action({ type: 'navigate', url: 'https://example.com' });
    expect(classifyActionRisk(navigate, { elementName: 'Delete everything' })).toBe('navigate');
  });

  it('never elevates a read action regardless of context', () => {
    const wait = action({ type: 'wait', ms: 100 });
    expect(classifyActionRisk(wait, { elementName: 'Delete everything' })).toBe('read');
  });
});

describe('elevateRisk', () => {
  it('leaves non-input base risks untouched', () => {
    expect(elevateRisk('read', { elementName: 'delete' })).toBe('read');
    expect(elevateRisk('navigate', { elementName: 'delete' })).toBe('navigate');
  });

  it('elevates input risk only when a keyword matches', () => {
    expect(elevateRisk('input', { elementName: 'delete account' })).toBe('state_changing');
    expect(elevateRisk('input', { elementName: 'next page' })).toBe('input');
  });

  it('leaves input risk untouched when no context is given', () => {
    expect(elevateRisk('input')).toBe('input');
  });
});

import { toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import type { Action } from './schema';
import { targetRefOf } from './target-ref';

function action<T extends Action>(value: T): T {
  return value;
}

describe('targetRefOf', () => {
  it('returns the ref for click', () => {
    expect(targetRefOf(action({ type: 'click', ref: toElementRef('ax:1') }))).toBe('ax:1');
  });

  it('returns the ref for input_text', () => {
    expect(targetRefOf(action({ type: 'input_text', ref: toElementRef('ax:1'), text: 'hi' }))).toBe(
      'ax:1',
    );
  });

  it('returns the ref for scroll when targeting an element', () => {
    expect(
      targetRefOf(action({ type: 'scroll', ref: toElementRef('ax:1'), direction: 'down' })),
    ).toBe('ax:1');
  });

  it('returns undefined for scroll with no target element', () => {
    expect(targetRefOf(action({ type: 'scroll', direction: 'down' }))).toBeUndefined();
  });

  it('returns the ref for get_dropdown_options', () => {
    expect(targetRefOf(action({ type: 'get_dropdown_options', ref: toElementRef('ax:1') }))).toBe(
      'ax:1',
    );
  });

  it('returns the ref for select_dropdown_option', () => {
    expect(
      targetRefOf(
        action({ type: 'select_dropdown_option', ref: toElementRef('ax:1'), value: 'a' }),
      ),
    ).toBe('ax:1');
  });

  it('returns the ref for send_keys when targeting an element', () => {
    expect(
      targetRefOf(action({ type: 'send_keys', ref: toElementRef('ax:1'), keys: 'Enter' })),
    ).toBe('ax:1');
  });

  it('returns undefined for send_keys with no target element', () => {
    expect(targetRefOf(action({ type: 'send_keys', keys: 'Enter' }))).toBeUndefined();
  });

  it('returns undefined for every action type with no ref concept', () => {
    expect(targetRefOf(action({ type: 'navigate', url: 'https://example.com' }))).toBeUndefined();
    expect(targetRefOf(action({ type: 'go_back' }))).toBeUndefined();
    expect(targetRefOf(action({ type: 'open_tab' }))).toBeUndefined();
    expect(targetRefOf(action({ type: 'switch_tab', tabId: 1 }))).toBeUndefined();
    expect(targetRefOf(action({ type: 'close_tab' }))).toBeUndefined();
    expect(targetRefOf(action({ type: 'wait', ms: 100 }))).toBeUndefined();
    expect(targetRefOf(action({ type: 'extract', instructions: 'read it' }))).toBeUndefined();
    expect(targetRefOf(action({ type: 'done', success: true, summary: 'ok' }))).toBeUndefined();
  });
});

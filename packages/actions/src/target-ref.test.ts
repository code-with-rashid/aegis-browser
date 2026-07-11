import { toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import type { Action } from './schema';
import { targetRefOf, withTargetRef } from './target-ref';

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

describe('withTargetRef', () => {
  it('replaces the ref on click', () => {
    const result = withTargetRef(
      action({ type: 'click', ref: toElementRef('ax:1') }),
      toElementRef('dom:2'),
    );
    expect(result).toEqual({ type: 'click', ref: 'dom:2' });
  });

  it('replaces the ref on input_text, preserving the other fields', () => {
    const result = withTargetRef(
      action({ type: 'input_text', ref: toElementRef('ax:1'), text: 'hello' }),
      toElementRef('dom:2'),
    );
    expect(result).toEqual({ type: 'input_text', ref: 'dom:2', text: 'hello' });
  });

  it('sets a ref on scroll even when it had none before', () => {
    const result = withTargetRef(
      action({ type: 'scroll', direction: 'down' }),
      toElementRef('dom:2'),
    );
    expect(result).toEqual({ type: 'scroll', direction: 'down', ref: 'dom:2' });
  });

  it('returns every action type with no ref concept unchanged', () => {
    const navigate = action({ type: 'navigate', url: 'https://example.com' });
    expect(withTargetRef(navigate, toElementRef('dom:2'))).toEqual(navigate);
    const done = action({ type: 'done', success: true, summary: 'ok' });
    expect(withTargetRef(done, toElementRef('dom:2'))).toEqual(done);
  });

  it('round-trips with targetRefOf', () => {
    const original = action({ type: 'click', ref: toElementRef('ax:1') });
    const retargeted = withTargetRef(original, toElementRef('dom:99'));
    expect(targetRefOf(retargeted)).toBe('dom:99');
  });
});

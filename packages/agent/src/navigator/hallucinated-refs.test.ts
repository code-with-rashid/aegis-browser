import type { Action } from '@aegis/actions';
import type { PerceptionPayload } from '@aegis/perception';
import { toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { findHallucinatedRefs } from './hallucinated-refs';

function perceptionWithRefs(...refs: string[]): PerceptionPayload {
  return {
    elements: refs.map((ref) => ({
      ref: toElementRef(ref),
      role: 'button',
      name: 'Some button',
      state: {},
      source: 'ax' as const,
    })),
    content: { text: '', truncated: false },
    tokenEstimate: 0,
    truncated: false,
  };
}

describe('findHallucinatedRefs', () => {
  it('returns empty when every ref is known', () => {
    const actions: Action[] = [
      { type: 'click', ref: toElementRef('ax:1') },
      { type: 'input_text', ref: toElementRef('ax:2'), text: 'hi' },
    ];
    const perception = perceptionWithRefs('ax:1', 'ax:2');

    expect(findHallucinatedRefs(actions, perception)).toEqual([]);
  });

  it('flags a ref that does not exist in perception', () => {
    const actions: Action[] = [{ type: 'click', ref: toElementRef('ax:99') }];
    const perception = perceptionWithRefs('ax:1');

    expect(findHallucinatedRefs(actions, perception)).toEqual([toElementRef('ax:99')]);
  });

  it('deduplicates repeated invalid refs across actions', () => {
    const actions: Action[] = [
      { type: 'click', ref: toElementRef('ax:99') },
      { type: 'click', ref: toElementRef('ax:99') },
    ];
    const perception = perceptionWithRefs('ax:1');

    expect(findHallucinatedRefs(actions, perception)).toEqual([toElementRef('ax:99')]);
  });

  it.each<[string, Action]>([
    ['get_dropdown_options', { type: 'get_dropdown_options', ref: toElementRef('ax:99') }],
    [
      'select_dropdown_option',
      { type: 'select_dropdown_option', ref: toElementRef('ax:99'), value: 'x' },
    ],
  ])('flags a hallucinated ref on %s', (_name, action) => {
    expect(findHallucinatedRefs([action], perceptionWithRefs('ax:1'))).toEqual([
      toElementRef('ax:99'),
    ]);
  });

  it('never flags actions with no ref field', () => {
    const actions: Action[] = [
      { type: 'navigate', url: 'https://example.com' },
      { type: 'go_back' },
      { type: 'wait', ms: 10 },
      { type: 'extract', instructions: 'read the page' },
      { type: 'done', success: true, summary: 'ok' },
      { type: 'open_tab' },
      { type: 'switch_tab', tabId: 1 },
      { type: 'close_tab' },
    ];

    expect(findHallucinatedRefs(actions, perceptionWithRefs())).toEqual([]);
  });

  it('does not flag scroll/send_keys when their optional ref is omitted', () => {
    const actions: Action[] = [
      { type: 'scroll', direction: 'down' },
      { type: 'send_keys', keys: 'Enter' },
    ];

    expect(findHallucinatedRefs(actions, perceptionWithRefs())).toEqual([]);
  });

  it('flags scroll/send_keys when their optional ref is present but unknown', () => {
    const actions: Action[] = [{ type: 'scroll', ref: toElementRef('ax:99'), direction: 'down' }];

    expect(findHallucinatedRefs(actions, perceptionWithRefs('ax:1'))).toEqual([
      toElementRef('ax:99'),
    ]);
  });
});

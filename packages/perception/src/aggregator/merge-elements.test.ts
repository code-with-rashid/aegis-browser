import { describe, expect, it } from 'vitest';

import { mergeElements } from './merge-elements';
import { perceivedElement } from './perceived-element-test-helpers';

describe('mergeElements', () => {
  it('merges an AX and a DOM element that share a backend node id into one entry', () => {
    const ax = perceivedElement({ ref: 'ax:42', role: 'button', name: 'Submit', source: 'ax' });
    const dom = perceivedElement({
      ref: 'dom:42',
      role: 'button',
      name: 'Submit',
      state: { disabled: true },
      source: 'dom',
    });

    const merged = mergeElements([ax], [dom]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.ref).toBe('el:42');
  });

  it('prefers the AX role/name when AX has a real (non-"unknown") value', () => {
    const ax = perceivedElement({ ref: 'ax:1', role: 'button', name: 'AX name', source: 'ax' });
    const dom = perceivedElement({
      ref: 'dom:1',
      role: 'generic',
      name: 'DOM name',
      source: 'dom',
    });

    const [merged] = mergeElements([ax], [dom]);

    expect(merged?.role).toBe('button');
    expect(merged?.name).toBe('AX name');
  });

  it('falls back to DOM role when AX role is "unknown"', () => {
    const ax = perceivedElement({ ref: 'ax:1', role: 'unknown', name: '', source: 'ax' });
    const dom = perceivedElement({ ref: 'dom:1', role: 'button', name: 'Go', source: 'dom' });

    const [merged] = mergeElements([ax], [dom]);

    expect(merged?.role).toBe('button');
    expect(merged?.name).toBe('Go');
  });

  it('merges state from both sources, with AX state winning on key conflicts', () => {
    const ax = perceivedElement({ ref: 'ax:1', state: { checked: true } });
    const dom = perceivedElement({ ref: 'dom:1', state: { checked: false, disabled: true } });

    const [merged] = mergeElements([ax], [dom]);

    expect(merged?.state).toEqual({ checked: true, disabled: true });
  });

  it('keeps an AX-only element with source "ax"', () => {
    const ax = perceivedElement({ ref: 'ax:9', name: 'Only in AX' });
    const [merged] = mergeElements([ax], []);
    expect(merged?.source).toBe('ax');
    expect(merged?.ref).toBe('el:9');
  });

  it('keeps a DOM-only element with source "dom"', () => {
    const dom = perceivedElement({ ref: 'dom:9', name: 'Only in DOM', source: 'dom' });
    const [merged] = mergeElements([], [dom]);
    expect(merged?.source).toBe('dom');
    expect(merged?.ref).toBe('el:9');
  });

  it('does not merge elements with different backend node ids', () => {
    const ax = perceivedElement({ ref: 'ax:1' });
    const dom = perceivedElement({ ref: 'dom:2' });
    expect(mergeElements([ax], [dom])).toHaveLength(2);
  });
});

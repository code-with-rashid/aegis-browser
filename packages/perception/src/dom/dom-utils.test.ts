import { describe, expect, it } from 'vitest';

import { el, text } from './dom-test-helpers';
import { collectText, parseAttributes, tagNameOf, walkElements } from './dom-utils';

describe('dom-utils', () => {
  it('parseAttributes turns the flat attribute array into a record', () => {
    const node = el('input', { type: 'text', value: 'hi' });
    expect(parseAttributes(node)).toEqual({ type: 'text', value: 'hi' });
  });

  it('collectText concatenates descendant text nodes', () => {
    const root = el('div', {}, [text('Hello'), el('span', {}, [text('world')])]);
    expect(collectText(root)).toBe('Hello world');
  });

  it('collectText skips subtrees rooted at a skipped tag', () => {
    const root = el('div', {}, [text('Keep'), el('script', {}, [text('drop me')])]);
    expect(collectText(root, new Set(['script']))).toBe('Keep');
  });

  it('tagNameOf lowercases the nodeName', () => {
    expect(tagNameOf(el('DIV'))).toBe('div');
  });

  it('walkElements visits every element node but not text nodes', () => {
    const root = el('div', {}, [text('x'), el('span', {}, [el('b')])]);
    const visited: string[] = [];
    walkElements(root, (node) => {
      visited.push(tagNameOf(node));
    });
    expect(visited).toEqual(['div', 'span', 'b']);
  });
});

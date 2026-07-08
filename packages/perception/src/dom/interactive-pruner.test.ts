import { describe, expect, it } from 'vitest';

import { el, text } from './dom-test-helpers';
import { pruneInteractiveElements } from './interactive-pruner';

describe('pruneInteractiveElements', () => {
  it('extracts a button using its text content as the name', () => {
    const root = el('div', {}, [el('button', {}, [text('Submit')])]);
    const elements = pruneInteractiveElements(root);
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ role: 'button', name: 'Submit', source: 'dom' });
  });

  it('extracts a link with its inner text as the name', () => {
    const root = el('a', { href: '/x' }, [text('Read more')]);
    const [link] = pruneInteractiveElements(root);
    expect(link?.role).toBe('a');
    expect(link?.name).toBe('Read more');
  });

  it('prefers aria-label over text content', () => {
    const root = el('button', { 'aria-label': 'Close dialog' }, [text('X')]);
    const [button] = pruneInteractiveElements(root);
    expect(button?.name).toBe('Close dialog');
  });

  it('uses placeholder as the name for an empty text input', () => {
    const root = el('input', { type: 'text', placeholder: 'Email address' });
    const [input] = pruneInteractiveElements(root);
    expect(input?.name).toBe('Email address');
  });

  it('surfaces the input value', () => {
    const root = el('input', { type: 'text', value: 'hello@example.com' });
    const [input] = pruneInteractiveElements(root);
    expect(input?.value).toBe('hello@example.com');
  });

  it('extracts disabled/checked as boolean state', () => {
    const root = el('input', { type: 'checkbox', checked: '', disabled: '' });
    const [checkbox] = pruneInteractiveElements(root);
    expect(checkbox?.state).toEqual({ checked: true, disabled: true });
  });

  it('treats an element with an interactive ARIA role as interactive', () => {
    const root = el('div', { role: 'button' }, [text('Custom button')]);
    const elements = pruneInteractiveElements(root);
    expect(elements).toHaveLength(1);
    expect(elements[0]?.role).toBe('button');
  });

  it('treats an element with a non-negative tabindex as interactive', () => {
    const root = el('div', { tabindex: '0' }, [text('Focusable row')]);
    expect(pruneInteractiveElements(root)).toHaveLength(1);
  });

  it('does not treat tabindex="-1" as interactive by itself', () => {
    const root = el('div', { tabindex: '-1' }, [text('Not focusable')]);
    expect(pruneInteractiveElements(root)).toHaveLength(0);
  });

  it('ignores a plain, non-interactive div', () => {
    const root = el('div', {}, [text('Just some text')]);
    expect(pruneInteractiveElements(root)).toHaveLength(0);
  });

  it('extracts a <select> and each of its <option>s separately', () => {
    const root = el('select', {}, [
      el('option', { value: '1' }, [text('One')]),
      el('option', { value: '2' }, [text('Two')]),
    ]);
    const elements = pruneInteractiveElements(root);
    expect(elements).toHaveLength(3);
    expect(elements.filter((element) => element.role === 'option')).toHaveLength(2);
  });

  it('assigns a ref derived from backendNodeId', () => {
    const button = el('button', {}, [text('Go')]);
    const [element] = pruneInteractiveElements(button);
    expect(element?.ref).toBe(`dom:${button.backendNodeId}`);
  });
});

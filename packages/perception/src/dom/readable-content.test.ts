import { describe, expect, it } from 'vitest';

import { el, text } from './dom-test-helpers';
import { extractReadableContent } from './readable-content';

const LONG_PARAGRAPH = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(3);

function articleFixture() {
  return el('body', {}, [
    el('nav', {}, [text('Home About Contact')]),
    el('header', {}, [text('Site Header')]),
    el('article', {}, [
      el('h1', {}, [text('A Great Article Title')]),
      el('p', {}, [text(LONG_PARAGRAPH)]),
      el('p', {}, [text(LONG_PARAGRAPH)]),
      el('p', {}, [text(LONG_PARAGRAPH)]),
    ]),
    el('footer', {}, [text('Copyright 2026')]),
  ]);
}

function listFixture() {
  const items = Array.from({ length: 10 }, (_unused, i) =>
    el('li', {}, [
      el('a', { href: `/item/${i}` }, [text(`List item number ${i} with some descriptive text`)]),
    ]),
  );
  return el('body', {}, [
    el('header', {}, [text('Site Header')]),
    el('main', {}, [el('ul', {}, items)]),
    el('footer', {}, [text('Copyright 2026')]),
  ]);
}

describe('extractReadableContent', () => {
  it('extracts article paragraphs and excludes nav/header/footer boilerplate', () => {
    const { text: content } = extractReadableContent(articleFixture());
    expect(content).toContain('A Great Article Title');
    expect(content).toContain('Lorem ipsum');
    expect(content).not.toContain('Home About Contact');
    expect(content).not.toContain('Site Header');
    expect(content).not.toContain('Copyright 2026');
  });

  it('extracts list items from a list-style page within a size cap', () => {
    const { text: content, truncated } = extractReadableContent(listFixture());
    expect(content).toContain('List item number 0');
    expect(content).toContain('List item number 9');
    expect(content).not.toContain('Site Header');
    expect(truncated).toBe(false);
  });

  it('caps output at maxLength and marks it truncated', () => {
    const manyParagraphs = Array.from({ length: 50 }, () => el('p', {}, [text(LONG_PARAGRAPH)]));
    const root = el('body', {}, [el('article', {}, manyParagraphs)]);

    const { text: content, truncated } = extractReadableContent(root, { maxLength: 500 });

    expect(truncated).toBe(true);
    expect(content.length).toBeLessThanOrEqual(500);
  });

  it('does not truncate content within the size cap', () => {
    const { text: content, truncated } = extractReadableContent(articleFixture(), {
      maxLength: 4000,
    });
    expect(truncated).toBe(false);
    expect(content.length).toBeLessThanOrEqual(4000);
  });

  it('returns empty content when there is nothing substantial to extract', () => {
    const root = el('body', {}, [el('nav', {}, [text('Home About')])]);
    const { text: content } = extractReadableContent(root);
    expect(content).toBe('');
  });

  it('ignores text that is not wrapped in a paragraph-like block element', () => {
    const root = el('body', {}, [
      el('div', {}, [
        el('div', { class: 'sidebar' }, [text('Related links '.repeat(20))]),
        el('article', {}, [el('p', {}, [text(LONG_PARAGRAPH)])]),
      ]),
    ]);
    const { text: content } = extractReadableContent(root);
    expect(content).toContain('Lorem ipsum');
    expect(content).not.toContain('Related links');
  });
});

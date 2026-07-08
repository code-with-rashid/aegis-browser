import type Protocol from 'devtools-protocol/types/protocol';

import { children, collectText, ELEMENT_NODE, tagNameOf } from './dom-utils';

/** The page's extracted readable content, capped in length. */
export interface ExtractedContent {
  readonly text: string;
  readonly truncated: boolean;
}

const NEGATIVE_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'iframe',
  'svg',
  'button',
]);
const CANDIDATE_TAGS = new Set(['article', 'main', 'section', 'div', 'body']);
const BLOCK_TEXT_TAGS = new Set([
  'p',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'td',
  'pre',
]);

const DEFAULT_MAX_LENGTH = 4000;
const MIN_CANDIDATE_TEXT_LENGTH = 40;

interface Candidate {
  readonly node: Protocol.DOM.Node;
  readonly score: number;
}

function textLength(node: Protocol.DOM.Node): number {
  return collectText(node, NEGATIVE_TAGS).trim().length;
}

function linkTextLength(node: Protocol.DOM.Node): number {
  let total = 0;
  const visit = (current: Protocol.DOM.Node): void => {
    if (current.nodeType === ELEMENT_NODE && tagNameOf(current) === 'a') {
      total += collectText(current, NEGATIVE_TAGS).trim().length;
      return;
    }
    for (const child of children(current)) {
      visit(child);
    }
  };
  visit(node);
  return total;
}

function paragraphCount(node: Protocol.DOM.Node): number {
  let count = 0;
  const visit = (current: Protocol.DOM.Node): void => {
    if (current.nodeType === ELEMENT_NODE && BLOCK_TEXT_TAGS.has(tagNameOf(current))) {
      count += 1;
    }
    for (const child of children(current)) {
      visit(child);
    }
  };
  visit(node);
  return count;
}

function scoreCandidate(node: Protocol.DOM.Node): number {
  const tag = tagNameOf(node);
  const tagBonus = tag === 'article' || tag === 'main' ? 100 : 0;
  return textLength(node) - linkTextLength(node) + paragraphCount(node) * 25 + tagBonus;
}

function collectCandidates(
  node: Protocol.DOM.Node,
  ancestorIsNegative: boolean,
  out: Candidate[],
): void {
  if (node.nodeType !== ELEMENT_NODE) {
    return;
  }
  const tag = tagNameOf(node);
  const isNegative = ancestorIsNegative || NEGATIVE_TAGS.has(tag);

  if (!isNegative && CANDIDATE_TAGS.has(tag) && textLength(node) >= MIN_CANDIDATE_TEXT_LENGTH) {
    out.push({ node, score: scoreCandidate(node) });
  }

  for (const child of children(node)) {
    collectCandidates(child, isNegative, out);
  }
}

function extractBlockText(node: Protocol.DOM.Node): string[] {
  const blocks: string[] = [];
  const visit = (current: Protocol.DOM.Node): void => {
    if (current.nodeType === ELEMENT_NODE) {
      const tag = tagNameOf(current);
      if (NEGATIVE_TAGS.has(tag)) {
        return;
      }
      if (BLOCK_TEXT_TAGS.has(tag)) {
        const text = collectText(current, NEGATIVE_TAGS).replace(/\s+/g, ' ').trim();
        if (text.length > 0) {
          blocks.push(text);
        }
        return;
      }
    }
    for (const child of children(current)) {
      visit(child);
    }
  };
  visit(node);
  return blocks;
}

/**
 * Extracts the page's main readable content (article/list body text) — re-enables what
 * Nanobrowser disabled after real content extraction proved unreliable. Scores candidate
 * containers by text density (text length minus link text, boosted by paragraph count
 * and `<article>`/`<main>` tags) and discards boilerplate
 * (`nav`/`header`/`footer`/`script`/`style`/`aside`/`form`/`button`).
 */
export function extractReadableContent(
  root: Protocol.DOM.Node,
  options: { readonly maxLength?: number } = {},
): ExtractedContent {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const candidates: Candidate[] = [];
  collectCandidates(root, false, candidates);

  if (candidates.length === 0) {
    return { text: '', truncated: false };
  }

  const best = candidates.reduce((top, current) => (current.score > top.score ? current : top));
  const blocks = extractBlockText(best.node);
  const fullText =
    blocks.length > 0
      ? blocks.join('\n\n')
      : collectText(best.node, NEGATIVE_TAGS).replace(/\s+/g, ' ').trim();

  if (fullText.length <= maxLength) {
    return { text: fullText, truncated: false };
  }

  return { text: fullText.slice(0, maxLength).trimEnd(), truncated: true };
}

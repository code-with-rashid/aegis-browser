import type { PerceivedElement } from '../ax/perceived-element';

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'is',
  'this',
  'that',
  'with',
  'at',
  'it',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function scoreElement(element: PerceivedElement, goalTokens: readonly string[]): number {
  if (goalTokens.length === 0) {
    return 0;
  }
  const haystack = `${element.role} ${element.name} ${element.value ?? ''}`.toLowerCase();
  let score = 0;
  for (const token of goalTokens) {
    if (haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Ranks elements by keyword overlap with `goal` (highest first); ties keep original
 * order, so ranking is deterministic. A lightweight, dependency-free heuristic — no
 * embeddings or model calls — so it stays fast and predictable on every perceive step.
 */
export function rankByRelevance(
  elements: readonly PerceivedElement[],
  goal: string,
): PerceivedElement[] {
  const goalTokens = tokenize(goal);
  return elements
    .map((element, index) => ({ element, index, score: scoreElement(element, goalTokens) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .map((entry) => entry.element);
}

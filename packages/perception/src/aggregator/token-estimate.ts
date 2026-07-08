import type { PerceivedElement } from '../ax/perceived-element';

/** A rough characters-per-token ratio, in line with common estimates for English text. */
export const CHARS_PER_TOKEN = 4;

/** A fast, provider-agnostic token estimate. Not exact, but deterministic and cheap. */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Estimates the token cost of including one element in the perception payload. */
export function estimateElementTokens(element: PerceivedElement): number {
  const parts = [
    element.role,
    element.name,
    element.value ?? '',
    Object.keys(element.state).join(','),
  ];
  return estimateTokens(parts.join(' '));
}

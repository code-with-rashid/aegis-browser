import type { PerceivedElement } from '../ax/perceived-element';
import type { ExtractedContent } from '../dom/readable-content';
import type { VisionPerception } from '../vision/vision-perception';
import { mergeElements } from './merge-elements';
import { rankByRelevance } from './relevance';
import { CHARS_PER_TOKEN, estimateElementTokens, estimateTokens } from './token-estimate';

/**
 * One compact, token-budgeted view of the page, ready to hand to the Navigator/Planner.
 * `vision` is only present when the caller opted in via `useVision` — see
 * `vision/vision-perception.ts`; it is never populated by default.
 */
export interface PerceptionPayload {
  readonly elements: readonly PerceivedElement[];
  readonly content: ExtractedContent;
  readonly tokenEstimate: number;
  readonly truncated: boolean;
  readonly vision?: VisionPerception;
}

export interface AggregatePerceptionInput {
  readonly axElements: readonly PerceivedElement[];
  readonly domElements: readonly PerceivedElement[];
  readonly content: ExtractedContent;
  /** The agent's current sub-goal, used to rank elements by relevance. */
  readonly goal: string;
  readonly maxTokens?: number;
}

const DEFAULT_MAX_TOKENS = 2000;

interface FittedContent {
  readonly text: string;
  readonly tokens: number;
  readonly truncated: boolean;
}

function fitContent(text: string, remainingTokens: number): FittedContent {
  const fullTokens = estimateTokens(text);
  if (fullTokens <= remainingTokens) {
    return { text, tokens: fullTokens, truncated: false };
  }
  const maxChars = remainingTokens * CHARS_PER_TOKEN;
  const fitted = text.slice(0, maxChars).trimEnd();
  return { text: fitted, tokens: estimateTokens(fitted), truncated: true };
}

/**
 * Merges AX+DOM elements (deduped by backend node), ranks them by relevance to `goal`,
 * and truncates to `maxTokens` — elements first, in rank order, then as much of the
 * readable content as remains in budget. Truncation is deterministic: the same input,
 * goal, and budget always produce the same output.
 */
export function aggregatePerception(input: AggregatePerceptionInput): PerceptionPayload {
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const ranked = rankByRelevance(mergeElements(input.axElements, input.domElements), input.goal);

  const selected: PerceivedElement[] = [];
  let usedTokens = 0;
  let elementsTruncated = false;

  for (const element of ranked) {
    const cost = estimateElementTokens(element);
    if (usedTokens + cost > maxTokens) {
      elementsTruncated = true;
      break;
    }
    selected.push(element);
    usedTokens += cost;
  }

  const remainingBudget = Math.max(0, maxTokens - usedTokens);
  const fittedContent = fitContent(input.content.text, remainingBudget);
  usedTokens += fittedContent.tokens;

  return {
    elements: selected,
    content: {
      text: fittedContent.text,
      truncated: fittedContent.truncated || input.content.truncated,
    },
    tokenEstimate: usedTokens,
    truncated: elementsTruncated || fittedContent.truncated || input.content.truncated,
  };
}

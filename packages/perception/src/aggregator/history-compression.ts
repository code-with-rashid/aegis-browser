import type { ElementRef } from '@aegis/shared';

import type { PerceptionPayload } from './perception-payload';
import { estimateTokens } from './token-estimate';

export interface CompressedElementSummary {
  readonly ref: ElementRef;
  readonly role: string;
  readonly name: string;
}

/** A minimal summary of a past {@link PerceptionPayload}, cheap enough to keep as history. */
export interface CompressedPerceptionSummary {
  readonly elementCount: number;
  readonly topElements: readonly CompressedElementSummary[];
  readonly contentSummary: string;
  readonly tokenEstimate: number;
}

export interface CompressForHistoryOptions {
  readonly maxElements?: number;
  readonly maxContentChars?: number;
}

const DEFAULT_MAX_ELEMENTS = 10;
const DEFAULT_MAX_CONTENT_CHARS = 200;

/**
 * Compresses a {@link PerceptionPayload} into a minimal summary suitable for keeping as
 * history across many agent-loop turns — full element/content detail for every past step
 * would blow the prompt budget over a long task. Keeps only the highest-ranked elements'
 * ref/role/name (the payload is expected to already be relevance-ranked, so "highest" is
 * just "first") and a short content excerpt.
 */
export function compressForHistory(
  payload: PerceptionPayload,
  options: CompressForHistoryOptions = {},
): CompressedPerceptionSummary {
  const maxElements = options.maxElements ?? DEFAULT_MAX_ELEMENTS;
  const maxContentChars = options.maxContentChars ?? DEFAULT_MAX_CONTENT_CHARS;

  const topElements = payload.elements.slice(0, maxElements).map((element) => ({
    ref: element.ref,
    role: element.role,
    name: element.name,
  }));

  const contentSummary = payload.content.text.slice(0, maxContentChars).trimEnd();
  const summaryText = `${topElements.map((element) => `${element.role}:${element.name}`).join(' ')} ${contentSummary}`;

  return {
    elementCount: payload.elements.length,
    topElements,
    contentSummary,
    tokenEstimate: estimateTokens(summaryText),
  };
}

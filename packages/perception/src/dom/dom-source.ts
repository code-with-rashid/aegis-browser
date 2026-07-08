import { isErr, ok, type Result } from '@aegis/shared';

import type { PerceivedElement } from '../ax/perceived-element';
import type { CdpError, CdpSession } from '../cdp/cdp-session';
import { pruneInteractiveElements } from './interactive-pruner';
import { extractReadableContent, type ExtractedContent } from './readable-content';

/** Merge-ready output of one DOM pass: interactive elements plus the page's readable content. */
export interface DomPerception {
  readonly elements: readonly PerceivedElement[];
  readonly content: ExtractedContent;
}

export interface DomPerceptionOptions {
  readonly maxContentLength?: number;
}

/**
 * Pulls the full DOM tree for the tab `session` is attached to (enabling the `DOM`
 * domain and fetching the whole document, piercing iframes/shadow roots), then derives
 * both the interactive-element list and the readable-content extraction from that single
 * tree — one CDP round trip, two merge-ready outputs for the perception aggregator (#10).
 */
export async function getDomPerception(
  session: CdpSession,
  options: DomPerceptionOptions = {},
): Promise<Result<DomPerception, CdpError>> {
  const enableResult = await session.send('DOM.enable');
  if (isErr(enableResult)) {
    return enableResult;
  }

  const documentResult = await session.send('DOM.getDocument', { depth: -1, pierce: true });
  if (isErr(documentResult)) {
    return documentResult;
  }

  const { root } = documentResult.value;
  const contentOptions =
    options.maxContentLength !== undefined ? { maxLength: options.maxContentLength } : {};

  return ok({
    elements: pruneInteractiveElements(root),
    content: extractReadableContent(root, contentOptions),
  });
}

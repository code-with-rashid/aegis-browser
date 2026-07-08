import { describe, expect, it } from 'vitest';

import { compressForHistory } from './history-compression';
import type { PerceptionPayload } from './perception-payload';
import { perceivedElement } from './perceived-element-test-helpers';
import { estimateElementTokens, estimateTokens } from './token-estimate';

function payloadWith(elementCount: number, contentLength: number): PerceptionPayload {
  const elements = Array.from({ length: elementCount }, (_unused, i) =>
    perceivedElement({
      ref: `el:${i}`,
      name: `Element number ${i} with a moderately long descriptive label`,
    }),
  );
  const content = { text: 'x'.repeat(contentLength), truncated: false };
  const tokenEstimate =
    elements.reduce((sum, element) => sum + estimateElementTokens(element), 0) +
    estimateTokens(content.text);

  return { elements, content, tokenEstimate, truncated: false };
}

describe('compressForHistory', () => {
  it('keeps only the configured max number of elements', () => {
    const summary = compressForHistory(payloadWith(20, 10), { maxElements: 5 });
    expect(summary.topElements).toHaveLength(5);
    expect(summary.elementCount).toBe(20);
  });

  it('truncates the content excerpt to maxContentChars', () => {
    const summary = compressForHistory(payloadWith(1, 1000), { maxContentChars: 50 });
    expect(summary.contentSummary.length).toBeLessThanOrEqual(50);
  });

  it('keeps only ref/role/name per element, dropping state/value/bounds', () => {
    const payload = payloadWith(1, 10);
    const [summary] = compressForHistory(payload).topElements;
    expect(Object.keys(summary ?? {}).sort()).toEqual(['name', 'ref', 'role']);
  });

  it('exposes a token estimate for the compressed summary', () => {
    const summary = compressForHistory(payloadWith(10, 500));
    expect(summary.tokenEstimate).toBeGreaterThan(0);
  });

  it('produces a much smaller token estimate than the original payload for a large page', () => {
    const payload = payloadWith(200, 5000);
    const summary = compressForHistory(payload);
    expect(summary.tokenEstimate).toBeLessThan(payload.tokenEstimate);
  });
});

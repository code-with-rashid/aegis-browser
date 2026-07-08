import { describe, expect, it } from 'vitest';

import { aggregatePerception } from './perception-payload';
import { perceivedElement } from './perceived-element-test-helpers';

describe('aggregatePerception', () => {
  it('merges AX+DOM and ranks by relevance to the goal', () => {
    const ax = [perceivedElement({ ref: 'ax:1', role: 'button', name: 'Submit order' })];
    const dom = [perceivedElement({ ref: 'dom:2', role: 'link', name: 'Help', source: 'dom' })];

    const payload = aggregatePerception({
      axElements: ax,
      domElements: dom,
      content: { text: '', truncated: false },
      goal: 'submit order',
    });

    expect(payload.elements[0]?.name).toBe('Submit order');
    expect(payload.truncated).toBe(false);
  });

  it('exposes a token estimate', () => {
    const payload = aggregatePerception({
      axElements: [perceivedElement({ ref: 'ax:1', name: 'Go' })],
      domElements: [],
      content: { text: 'Some readable content.', truncated: false },
      goal: 'go',
    });

    expect(payload.tokenEstimate).toBeGreaterThan(0);
  });

  it('truncates elements deterministically once the token budget is exceeded', () => {
    const manyElements = Array.from({ length: 50 }, (_unused, i) =>
      perceivedElement({
        ref: `ax:${i}`,
        role: 'button',
        name: `Button number ${i} with a longish label`,
      }),
    );

    const first = aggregatePerception({
      axElements: manyElements,
      domElements: [],
      content: { text: '', truncated: false },
      goal: 'button',
      maxTokens: 100,
    });
    const second = aggregatePerception({
      axElements: manyElements,
      domElements: [],
      content: { text: '', truncated: false },
      goal: 'button',
      maxTokens: 100,
    });

    expect(first.truncated).toBe(true);
    expect(first.elements.length).toBeLessThan(manyElements.length);
    // Deterministic: same input + budget always yields the same truncated output.
    expect(first.elements.map((e) => e.ref)).toEqual(second.elements.map((e) => e.ref));
  });

  it('fits as much readable content as remains in budget after elements, truncating the rest', () => {
    const longContent = 'word '.repeat(2000);

    const payload = aggregatePerception({
      axElements: [perceivedElement({ ref: 'ax:1', name: 'Go' })],
      domElements: [],
      content: { text: longContent, truncated: false },
      goal: 'go',
      maxTokens: 50,
    });

    expect(payload.truncated).toBe(true);
    expect(payload.content.truncated).toBe(true);
    expect(payload.content.text.length).toBeLessThan(longContent.length);
  });

  it('propagates upstream content truncation even if the budget was not the cause', () => {
    const payload = aggregatePerception({
      axElements: [],
      domElements: [],
      content: { text: 'short', truncated: true },
      goal: 'anything',
      maxTokens: 2000,
    });

    expect(payload.truncated).toBe(true);
    expect(payload.content.truncated).toBe(true);
  });

  it('never exceeds the token budget across elements + content', () => {
    const manyElements = Array.from({ length: 30 }, (_unused, i) =>
      perceivedElement({ ref: `ax:${i}`, name: `Item ${i}` }),
    );

    const payload = aggregatePerception({
      axElements: manyElements,
      domElements: [],
      content: { text: 'word '.repeat(500), truncated: false },
      goal: 'item',
      maxTokens: 200,
    });

    expect(payload.tokenEstimate).toBeLessThanOrEqual(200);
  });
});

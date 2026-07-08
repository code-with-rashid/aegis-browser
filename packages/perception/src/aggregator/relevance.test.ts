import { describe, expect, it } from 'vitest';

import { perceivedElement } from './perceived-element-test-helpers';
import { rankByRelevance } from './relevance';

describe('rankByRelevance', () => {
  it('ranks an element matching the goal above one that does not', () => {
    const submit = perceivedElement({ ref: 'e1', role: 'button', name: 'Submit form' });
    const cancel = perceivedElement({ ref: 'e2', role: 'button', name: 'Cancel' });

    const ranked = rankByRelevance([cancel, submit], 'submit the form');

    expect(ranked[0]).toBe(submit);
    expect(ranked[1]).toBe(cancel);
  });

  it('scores by keyword overlap, more matches ranking higher', () => {
    const twoMatches = perceivedElement({ ref: 'e1', role: 'button', name: 'Submit order' });
    const oneMatch = perceivedElement({ ref: 'e2', role: 'button', name: 'Submit' });
    const noMatch = perceivedElement({ ref: 'e3', role: 'link', name: 'Help' });

    const ranked = rankByRelevance([noMatch, oneMatch, twoMatches], 'submit order');

    expect(ranked).toEqual([twoMatches, oneMatch, noMatch]);
  });

  it('keeps original order for tied scores (stable sort)', () => {
    const first = perceivedElement({ ref: 'e1', name: 'Alpha' });
    const second = perceivedElement({ ref: 'e2', name: 'Beta' });

    const ranked = rankByRelevance([first, second], 'unrelated goal text');

    expect(ranked).toEqual([first, second]);
  });

  it('ignores stopwords when tokenizing the goal', () => {
    const target = perceivedElement({ ref: 'e1', name: 'the form' });
    const ranked = rankByRelevance([target], 'the a an');
    // "the"/"a"/"an" are all stopwords, so nothing should score above 0 — order unchanged.
    expect(ranked).toEqual([target]);
  });

  it('is case-insensitive', () => {
    const target = perceivedElement({ ref: 'e1', name: 'SUBMIT' });
    const other = perceivedElement({ ref: 'e2', name: 'cancel' });

    const ranked = rankByRelevance([other, target], 'submit');

    expect(ranked[0]).toBe(target);
  });
});

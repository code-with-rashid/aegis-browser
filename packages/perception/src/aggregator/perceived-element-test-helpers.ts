import { toElementRef } from '@aegis/shared';

import type { PerceivedElement } from '../ax/perceived-element';

/** Builds a fixture {@link PerceivedElement} for tests — never used by production code. */
export function perceivedElement(
  overrides: Partial<Omit<PerceivedElement, 'ref'>> & { ref: string },
): PerceivedElement {
  const { ref, ...rest } = overrides;
  return {
    role: 'button',
    name: '',
    state: {},
    source: 'ax',
    ...rest,
    ref: toElementRef(ref),
  };
}

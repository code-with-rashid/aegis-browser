import type { ElementRef } from '@aegis/shared';

/** Which extraction pass produced a {@link PerceivedElement}. */
export type PerceptionSource = 'ax' | 'dom' | 'vision';

/** A page element's on-screen bounding box, in CSS pixels. */
export interface ElementBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The agent's normalized view of one page element, merged from whichever extraction
 * pass(es) produced it. `bounds` is filled in once a DOM cross-reference is available
 * (the DOM pruner / perception aggregator); the AX-only extractor does not set it.
 */
export interface PerceivedElement {
  readonly ref: ElementRef;
  readonly role: string;
  readonly name: string;
  readonly value?: string;
  readonly state: Readonly<Record<string, string | number | boolean>>;
  readonly bounds?: ElementBounds;
  readonly source: PerceptionSource;
}

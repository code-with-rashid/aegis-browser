export type { CdpErrorCode, CdpSession } from './cdp/cdp-session';
export { CdpError } from './cdp/cdp-session';
export { createChromeCdpSession } from './cdp/chrome-cdp-session';
export type { FakeCdp, FakeCdpOptions } from './cdp/fake-cdp';
export { createFakeCdp } from './cdp/fake-cdp';

export type { ElementBounds, PerceptionSource, PerceivedElement } from './ax/perceived-element';
export type { NormalizedAxTree } from './ax/ax-tree-normalizer';
export { normalizeAxTree } from './ax/ax-tree-normalizer';
export { getPerceivedAxTree } from './ax/ax-tree-source';

export type { CdpErrorCode, CdpSession } from './cdp/cdp-session';
export { CdpError } from './cdp/cdp-session';
export { createChromeCdpSession } from './cdp/chrome-cdp-session';
export type { FakeCdp, FakeCdpOptions } from './cdp/fake-cdp';
export { createFakeCdp } from './cdp/fake-cdp';

export type { ElementBounds, PerceptionSource, PerceivedElement } from './ax/perceived-element';
export type { NormalizedAxTree } from './ax/ax-tree-normalizer';
export { normalizeAxTree } from './ax/ax-tree-normalizer';
export { getPerceivedAxTree } from './ax/ax-tree-source';

export { pruneInteractiveElements } from './dom/interactive-pruner';
export type { ExtractedContent } from './dom/readable-content';
export { extractReadableContent } from './dom/readable-content';
export type { DomPerception, DomPerceptionOptions } from './dom/dom-source';
export { getDomPerception } from './dom/dom-source';

export { mergeElements } from './aggregator/merge-elements';
export { rankByRelevance } from './aggregator/relevance';
export {
  estimateTokens,
  estimateElementTokens,
  CHARS_PER_TOKEN,
} from './aggregator/token-estimate';
export type { PerceptionPayload, AggregatePerceptionInput } from './aggregator/perception-payload';
export { aggregatePerception } from './aggregator/perception-payload';
export type {
  CompressedElementSummary,
  CompressedPerceptionSummary,
  CompressForHistoryOptions,
} from './aggregator/history-compression';
export { compressForHistory } from './aggregator/history-compression';
export type { GetPerceptionPayloadOptions } from './aggregator/perception-source';
export { getPerceptionPayload } from './aggregator/perception-source';

export type {
  ScreenshotFormat,
  CapturedScreenshot,
  CaptureScreenshotOptions,
} from './vision/screenshot';
export { captureScreenshot } from './vision/screenshot';
export { quadToBounds, getElementBounds } from './vision/element-bounds';
export type { VisionPerception, GetVisionPerceptionOptions } from './vision/vision-perception';
export { getVisionPerception } from './vision/vision-perception';

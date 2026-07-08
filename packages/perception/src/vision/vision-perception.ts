import { isErr, ok, type ElementRef, type Result } from '@aegis/shared';

import type { ElementBounds, PerceivedElement } from '../ax/perceived-element';
import type { CdpError, CdpSession } from '../cdp/cdp-session';
import { getElementBounds } from './element-bounds';
import {
  captureScreenshot,
  type CapturedScreenshot,
  type CaptureScreenshotOptions,
} from './screenshot';

const REF_PATTERN = /^(?:ax|dom|el):(\d+)$/;

function backendNodeIdOf(ref: ElementRef): number | undefined {
  const match = REF_PATTERN.exec(ref);
  if (!match) {
    return undefined;
  }
  const [, id] = match;
  return id !== undefined ? Number(id) : undefined;
}

/** The on-demand vision `PerceptionSource`: a screenshot plus per-element bounding boxes. */
export interface VisionPerception {
  readonly screenshot: CapturedScreenshot;
  readonly elementBounds: ReadonlyMap<ElementRef, ElementBounds>;
}

export type GetVisionPerceptionOptions = CaptureScreenshotOptions;

/**
 * Captures a screenshot and, for each of `elements`, its bounding box — so a
 * vision-capable model can be shown an annotated screenshot or have pixel-coordinate
 * output mapped back to a ref. This is a fallback for canvas/icon-only UIs where AX/DOM
 * structure is missing or unhelpful; it is never called by the default perception
 * pipeline (`getPerceptionPayload`) unless the caller opts in via `useVision`.
 *
 * An element whose ref doesn't encode a backend node id, or whose box model fetch fails,
 * is simply omitted from `elementBounds` — one bad element never fails the whole capture.
 */
export async function getVisionPerception(
  session: CdpSession,
  elements: readonly PerceivedElement[],
  options: GetVisionPerceptionOptions = {},
): Promise<Result<VisionPerception, CdpError>> {
  const screenshotResult = await captureScreenshot(session, options);
  if (isErr(screenshotResult)) {
    return screenshotResult;
  }

  const boundsEntries = await Promise.all(
    elements.map(async (element): Promise<readonly [ElementRef, ElementBounds] | undefined> => {
      const backendNodeId = backendNodeIdOf(element.ref);
      if (backendNodeId === undefined) {
        return undefined;
      }
      const boundsResult = await getElementBounds(session, backendNodeId);
      if (isErr(boundsResult) || boundsResult.value === undefined) {
        return undefined;
      }
      return [element.ref, boundsResult.value];
    }),
  );

  const elementBounds = new Map(
    boundsEntries.filter(
      (entry): entry is readonly [ElementRef, ElementBounds] => entry !== undefined,
    ),
  );

  return ok({ screenshot: screenshotResult.value, elementBounds });
}

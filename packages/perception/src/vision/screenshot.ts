import { isErr, ok, type Result } from '@aegis/shared';

import type { CdpError, CdpSession } from '../cdp/cdp-session';

export type ScreenshotFormat = 'png' | 'jpeg' | 'webp';

export interface CapturedScreenshot {
  /** Base64-encoded image data. */
  readonly data: string;
  readonly format: ScreenshotFormat;
}

export interface CaptureScreenshotOptions {
  readonly format?: ScreenshotFormat;
  /** Compression quality 0-100, jpeg only. */
  readonly quality?: number;
}

/** Captures a screenshot of the tab `session` is attached to via `Page.captureScreenshot`. */
export async function captureScreenshot(
  session: CdpSession,
  options: CaptureScreenshotOptions = {},
): Promise<Result<CapturedScreenshot, CdpError>> {
  const format = options.format ?? 'png';
  const result = await session.send('Page.captureScreenshot', {
    format,
    ...(options.quality !== undefined ? { quality: options.quality } : {}),
  });
  if (isErr(result)) {
    return result;
  }
  return ok({ data: result.value.data, format });
}

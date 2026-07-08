import { err, isErr, isOk, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { CdpError } from '../cdp/cdp-session';
import { createFakeCdp } from '../cdp/fake-cdp';
import { captureScreenshot } from './screenshot';

describe('captureScreenshot', () => {
  it('defaults to png format', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        expect(method).toBe('Page.captureScreenshot');
        expect(params).toEqual({ format: 'png' });
        return ok({ data: 'base64data' });
      },
    });
    await cdp.attach();

    const result = await captureScreenshot(cdp);

    expect(isOk(result) && result.value).toEqual({ data: 'base64data', format: 'png' });
  });

  it('passes a custom format and jpeg quality through', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (_method, params) => {
        expect(params).toEqual({ format: 'jpeg', quality: 80 });
        return ok({ data: 'jpegdata' });
      },
    });
    await cdp.attach();

    const result = await captureScreenshot(cdp, { format: 'jpeg', quality: 80 });

    expect(isOk(result) && result.value.format).toBe('jpeg');
  });

  it('propagates a CDP failure', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => err(new CdpError('CDP_SEND_FAILED', 'capture failed')),
    });
    await cdp.attach();

    const result = await captureScreenshot(cdp);

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });
});

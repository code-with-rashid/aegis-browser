import { err, isErr, isOk, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { CdpError } from '../cdp/cdp-session';
import { createFakeCdp } from '../cdp/fake-cdp';
import { getVisionPerception } from './vision-perception';

function element(ref: string, name = '') {
  return { ref: toElementRef(ref), role: 'button', name, state: {}, source: 'ax' as const };
}

describe('getVisionPerception', () => {
  it('captures a screenshot and the bounds of each given element', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        if (method === 'Page.captureScreenshot') {
          return ok({ data: 'imgdata' });
        }
        if (method === 'DOM.getBoxModel') {
          expect(params).toEqual({ backendNodeId: 42 });
          return ok({ model: { border: [0, 0, 10, 0, 10, 10, 0, 10] } });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await getVisionPerception(cdp, [element('ax:42', 'Go')]);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.screenshot).toEqual({ data: 'imgdata', format: 'png' });
      expect(result.value.elementBounds.get(toElementRef('ax:42'))).toEqual({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
    }
  });

  it('skips an element whose ref does not encode a backend node id', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) =>
        method === 'Page.captureScreenshot' ? ok({ data: 'imgdata' }) : ok(undefined),
    });
    await cdp.attach();

    const result = await getVisionPerception(cdp, [element('custom-ref')]);

    expect(isOk(result) && result.value.elementBounds.size).toBe(0);
  });

  it('omits an element whose box model fetch fails, without failing the whole call', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'Page.captureScreenshot') {
          return ok({ data: 'imgdata' });
        }
        if (method === 'DOM.getBoxModel') {
          return err(new CdpError('CDP_SEND_FAILED', 'node gone'));
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await getVisionPerception(cdp, [element('ax:42')]);

    expect(isOk(result)).toBe(true);
    expect(isOk(result) && result.value.elementBounds.size).toBe(0);
  });

  it('propagates a screenshot capture failure without fetching any bounds', async () => {
    const calls: string[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        calls.push(method);
        return err(new CdpError('CDP_SEND_FAILED', 'capture failed'));
      },
    });
    await cdp.attach();

    const result = await getVisionPerception(cdp, [element('ax:42')]);

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
    expect(calls).toEqual(['Page.captureScreenshot']);
  });

  it('returns an empty bounds map when given no elements', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => ok({ data: 'imgdata' }),
    });
    await cdp.attach();

    const result = await getVisionPerception(cdp, []);

    expect(isOk(result) && result.value.elementBounds.size).toBe(0);
  });
});

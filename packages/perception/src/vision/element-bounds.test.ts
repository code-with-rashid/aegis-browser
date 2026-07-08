import { err, isErr, isOk, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { CdpError } from '../cdp/cdp-session';
import { createFakeCdp } from '../cdp/fake-cdp';
import { getElementBounds, quadToBounds } from './element-bounds';

describe('quadToBounds', () => {
  it('computes the axis-aligned bounding box of a clockwise quad', () => {
    // top-left, top-right, bottom-right, bottom-left
    const quad = [10, 20, 110, 20, 110, 70, 10, 70];
    expect(quadToBounds(quad)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('returns undefined for a quad with fewer than 8 values', () => {
    expect(quadToBounds([1, 2, 3])).toBeUndefined();
  });

  it('returns a zero-size box for a degenerate (point) quad', () => {
    const quad = [5, 5, 5, 5, 5, 5, 5, 5];
    expect(quadToBounds(quad)).toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });
});

describe('getElementBounds', () => {
  it('fetches the border quad via DOM.getBoxModel and converts it to bounds', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        expect(method).toBe('DOM.getBoxModel');
        expect(params).toEqual({ backendNodeId: 42 });
        return ok({ model: { border: [0, 0, 100, 0, 100, 40, 0, 40] } });
      },
    });
    await cdp.attach();

    const result = await getElementBounds(cdp, 42);

    expect(isOk(result) && result.value).toEqual({ x: 0, y: 0, width: 100, height: 40 });
  });

  it('propagates a CDP failure', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => err(new CdpError('CDP_SEND_FAILED', 'no box model')),
    });
    await cdp.attach();

    const result = await getElementBounds(cdp, 42);

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });
});

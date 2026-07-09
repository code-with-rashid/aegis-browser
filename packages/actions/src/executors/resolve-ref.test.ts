import { err, isErr, isOk, ok, toElementRef } from '@aegis/shared';
import { CdpError, createFakeCdp } from '@aegis/perception';
import { describe, expect, it } from 'vitest';

import { backendNodeIdOfRef, focusElement, resolveRef, selectElementContent } from './resolve-ref';

describe('backendNodeIdOfRef', () => {
  it.each([
    ['ax:42', 42],
    ['dom:7', 7],
    ['el:100', 100],
  ])('parses "%s" to %d', (ref, expected) => {
    expect(backendNodeIdOfRef(toElementRef(ref))).toBe(expected);
  });

  it('returns undefined for a ref with no recognizable prefix', () => {
    expect(backendNodeIdOfRef(toElementRef('custom-ref'))).toBeUndefined();
  });
});

describe('resolveRef', () => {
  it('resolves a valid ref to a backend node id + object id', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        expect(method).toBe('DOM.resolveNode');
        expect(params).toEqual({ backendNodeId: 42 });
        return ok({ object: { type: 'object', objectId: 'obj-1' } });
      },
    });
    await cdp.attach();

    const result = await resolveRef(cdp, toElementRef('ax:42'));

    expect(isOk(result) && result.value).toEqual({ backendNodeId: 42, objectId: 'obj-1' });
  });

  it('fails with REF_NOT_FOUND when the ref has no backend node id', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();

    const result = await resolveRef(cdp, toElementRef('custom-ref'));

    expect(isErr(result) && result.error.code).toBe('REF_NOT_FOUND');
  });

  it('fails with ELEMENT_DETACHED when DOM.resolveNode fails', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => err(new CdpError('CDP_SEND_FAILED', 'node gone')),
    });
    await cdp.attach();

    const result = await resolveRef(cdp, toElementRef('ax:42'));

    expect(isErr(result) && result.error.code).toBe('ELEMENT_DETACHED');
  });

  it('fails with ELEMENT_DETACHED when the resolved object has no objectId', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => ok({ object: { type: 'undefined' } }),
    });
    await cdp.attach();

    const result = await resolveRef(cdp, toElementRef('ax:42'));

    expect(isErr(result) && result.error.code).toBe('ELEMENT_DETACHED');
  });
});

describe('focusElement', () => {
  it('calls Runtime.callFunctionOn with a focus() declaration', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        expect(method).toBe('Runtime.callFunctionOn');
        expect(params).toMatchObject({ objectId: 'obj-1' });
        return ok({ result: { type: 'undefined' } });
      },
    });
    await cdp.attach();

    const result = await focusElement(cdp, 'obj-1');

    expect(isOk(result)).toBe(true);
  });

  it('propagates a CDP failure', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => err(new CdpError('CDP_SEND_FAILED', 'boom')),
    });
    await cdp.attach();

    const result = await focusElement(cdp, 'obj-1');

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });
});

describe('selectElementContent', () => {
  it('calls Runtime.callFunctionOn with a selection declaration', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        expect(method).toBe('Runtime.callFunctionOn');
        expect(params).toMatchObject({ objectId: 'obj-1' });
        return ok({ result: { type: 'undefined' } });
      },
    });
    await cdp.attach();

    const result = await selectElementContent(cdp, 'obj-1');

    expect(isOk(result)).toBe(true);
  });

  it('propagates a CDP failure', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => err(new CdpError('CDP_SEND_FAILED', 'boom')),
    });
    await cdp.attach();

    const result = await selectElementContent(cdp, 'obj-1');

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });
});

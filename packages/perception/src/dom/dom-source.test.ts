import { err, isErr, isOk, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { CdpError } from '../cdp/cdp-session';
import { createFakeCdp } from '../cdp/fake-cdp';
import { el, text } from './dom-test-helpers';
import { getDomPerception } from './dom-source';

describe('getDomPerception', () => {
  it('enables the DOM domain, fetches the full pierced document, and combines both extractions', async () => {
    const calls: { method: string; params: unknown }[] = [];
    const root = el('body', {}, [
      el('button', {}, [text('Go')]),
      el('article', {}, [
        el('p', {}, [
          text('Some readable content here that is long enough to pass the size floor.'),
        ]),
      ]),
    ]);

    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        calls.push({ method, params });
        if (method === 'DOM.getDocument') {
          return ok({ root });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await getDomPerception(cdp);

    expect(calls[0]).toEqual({ method: 'DOM.enable', params: undefined });
    expect(calls[1]).toEqual({ method: 'DOM.getDocument', params: { depth: -1, pierce: true } });
    expect(isOk(result) && result.value.elements).toHaveLength(1);
    expect(isOk(result) && result.value.content.text).toContain('Some readable content');
  });

  it('propagates a failure from enabling the DOM domain', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => err(new CdpError('CDP_SEND_FAILED', 'boom')),
    });
    await cdp.attach();

    const result = await getDomPerception(cdp);
    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });

  it('propagates a failure from getDocument', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'DOM.getDocument') {
          return err(new CdpError('CDP_SEND_FAILED', 'fetch failed'));
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await getDomPerception(cdp);
    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });

  it('passes maxContentLength through to the content extractor', async () => {
    const root = el('article', {}, [el('p', {}, [text('word '.repeat(200))])]);
    const cdp = createFakeCdp(1, {
      onSend: (method) => (method === 'DOM.getDocument' ? ok({ root }) : ok(undefined)),
    });
    await cdp.attach();

    const result = await getDomPerception(cdp, { maxContentLength: 50 });

    expect(isOk(result) && result.value.content.truncated).toBe(true);
    expect(isOk(result) && result.value.content.text.length).toBeLessThanOrEqual(50);
  });
});

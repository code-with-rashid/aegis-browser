import { err, isErr, isOk, ok } from '@aegis/shared';
import type Protocol from 'devtools-protocol/types/protocol';
import { describe, expect, it } from 'vitest';

import { CdpError } from '../cdp/cdp-session';
import { createFakeCdp } from '../cdp/fake-cdp';
import { el, text } from '../dom/dom-test-helpers';
import { getPerceptionPayload } from './perception-source';

function axValue(value: unknown): Protocol.Accessibility.AXValue {
  return { type: 'string', value };
}

function domRoot(): Protocol.DOM.Node {
  return el('body', {}, [
    el('button', {}, [text('Submit order')]),
    el('article', {}, [
      el('p', {}, [text('Some readable content that is long enough to pass the size floor.')]),
    ]),
  ]);
}

describe('getPerceptionPayload', () => {
  it('combines AX + DOM into one ranked, budgeted payload', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          const nodes: Protocol.Accessibility.AXNode[] = [
            {
              nodeId: '1',
              ignored: false,
              role: axValue('button'),
              name: axValue('Submit order'),
              backendDOMNodeId: 5,
            },
          ];
          return ok({ nodes });
        }
        if (method === 'DOM.getDocument') {
          return ok({ root: domRoot() });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await getPerceptionPayload(cdp, { goal: 'submit order' });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.elements[0]?.name).toBe('Submit order');
      expect(result.value.content.text).toContain('Some readable content');
      expect(result.value.tokenEstimate).toBeGreaterThan(0);
    }
  });

  it('propagates an AX fetch failure without calling the DOM domain', async () => {
    const calls: string[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        calls.push(method);
        return err(new CdpError('CDP_SEND_FAILED', 'boom'));
      },
    });
    await cdp.attach();

    const result = await getPerceptionPayload(cdp, { goal: 'anything' });

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
    expect(calls).not.toContain('DOM.enable');
  });

  it('propagates a DOM fetch failure', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method.startsWith('DOM.')) {
          return err(new CdpError('CDP_SEND_FAILED', 'dom failed'));
        }
        return ok({ nodes: [] });
      },
    });
    await cdp.attach();

    const result = await getPerceptionPayload(cdp, { goal: 'anything' });

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });

  it('respects maxTokens and maxContentLength options', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          return ok({ nodes: [] });
        }
        if (method === 'DOM.getDocument') {
          const root = el('article', {}, [el('p', {}, [text('word '.repeat(500))])]);
          return ok({ root });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await getPerceptionPayload(cdp, {
      goal: 'read',
      maxTokens: 20,
      maxContentLength: 10000,
    });

    expect(isOk(result) && result.value.truncated).toBe(true);
    expect(isOk(result) && result.value.tokenEstimate).toBeLessThanOrEqual(20);
  });

  it('does not capture a screenshot unless useVision is set', async () => {
    const calls: string[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        calls.push(method);
        if (method === 'Accessibility.getFullAXTree') {
          return ok({ nodes: [] });
        }
        if (method === 'DOM.getDocument') {
          return ok({ root: domRoot() });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await getPerceptionPayload(cdp, { goal: 'anything' });

    expect(isOk(result) && result.value.vision).toBeUndefined();
    expect(calls).not.toContain('Page.captureScreenshot');
  });

  it('captures vision and attaches it to the payload when useVision is true', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          return ok({ nodes: [] });
        }
        if (method === 'DOM.getDocument') {
          return ok({ root: domRoot() });
        }
        if (method === 'Page.captureScreenshot') {
          return ok({ data: 'imgdata' });
        }
        return ok({ model: { border: [0, 0, 10, 0, 10, 10, 0, 10] } });
      },
    });
    await cdp.attach();

    const result = await getPerceptionPayload(cdp, { goal: 'submit order', useVision: true });

    expect(isOk(result) && result.value.vision?.screenshot).toEqual({
      data: 'imgdata',
      format: 'png',
    });
  });

  it('propagates a vision capture failure when useVision is true', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          return ok({ nodes: [] });
        }
        if (method === 'DOM.getDocument') {
          return ok({ root: domRoot() });
        }
        return err(new CdpError('CDP_SEND_FAILED', 'no screenshot'));
      },
    });
    await cdp.attach();

    const result = await getPerceptionPayload(cdp, { goal: 'anything', useVision: true });

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });
});

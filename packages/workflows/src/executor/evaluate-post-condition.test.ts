import { CdpError, createFakeCdp, type FakeCdp } from '@aegis/perception';
import { err, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import type { PostCondition } from '../schema';
import { evaluatePostCondition } from './evaluate-post-condition';

async function fakeCdp(onSend: (method: string) => unknown): Promise<FakeCdp> {
  const cdp = createFakeCdp(1, {
    onSend: (method) => {
      const result = onSend(method);
      return result instanceof CdpError ? err(result) : ok(result);
    },
  });
  await cdp.attach();
  return cdp;
}

describe('evaluatePostCondition', () => {
  it('reports element_visible true when the selector matches a visible element', async () => {
    const cdp = await fakeCdp((method) => {
      switch (method) {
        case 'DOM.getDocument':
          return { root: { nodeId: 1 } };
        case 'DOM.querySelector':
          return { nodeId: 42 };
        case 'DOM.resolveNode':
          return { object: { objectId: 'obj-1' } };
        case 'Runtime.callFunctionOn':
          return { result: { value: true } };
        default:
          throw new Error(`unexpected CDP call: ${method}`);
      }
    });
    const condition: PostCondition = { type: 'element_visible', selector: '#banner' };

    const result = await evaluatePostCondition(condition, cdp);

    expect(result).toEqual(ok(true));
  });

  it('reports element_visible false when the matched element is hidden', async () => {
    const cdp = await fakeCdp((method) => {
      switch (method) {
        case 'DOM.getDocument':
          return { root: { nodeId: 1 } };
        case 'DOM.querySelector':
          return { nodeId: 42 };
        case 'DOM.resolveNode':
          return { object: { objectId: 'obj-1' } };
        case 'Runtime.callFunctionOn':
          return { result: { value: false } };
        default:
          throw new Error(`unexpected CDP call: ${method}`);
      }
    });
    const condition: PostCondition = { type: 'element_visible', selector: '#banner' };

    const result = await evaluatePostCondition(condition, cdp);

    expect(result).toEqual(ok(false));
  });

  it('reports element_visible false, not an error, when the selector matches nothing', async () => {
    const cdp = await fakeCdp((method) => {
      switch (method) {
        case 'DOM.getDocument':
          return { root: { nodeId: 1 } };
        case 'DOM.querySelector':
          return { nodeId: 0 };
        default:
          throw new Error(`unexpected CDP call: ${method}`);
      }
    });
    const condition: PostCondition = { type: 'element_visible', selector: '#gone' };

    const result = await evaluatePostCondition(condition, cdp);

    expect(result).toEqual(ok(false));
  });

  it('reports element_hidden true when the selector matches nothing', async () => {
    const cdp = await fakeCdp((method) => {
      switch (method) {
        case 'DOM.getDocument':
          return { root: { nodeId: 1 } };
        case 'DOM.querySelector':
          return { nodeId: 0 };
        default:
          throw new Error(`unexpected CDP call: ${method}`);
      }
    });
    const condition: PostCondition = { type: 'element_hidden', selector: '#gone' };

    const result = await evaluatePostCondition(condition, cdp);

    expect(result).toEqual(ok(true));
  });

  it('reports element_hidden false when the matched element is visible', async () => {
    const cdp = await fakeCdp((method) => {
      switch (method) {
        case 'DOM.getDocument':
          return { root: { nodeId: 1 } };
        case 'DOM.querySelector':
          return { nodeId: 42 };
        case 'DOM.resolveNode':
          return { object: { objectId: 'obj-1' } };
        case 'Runtime.callFunctionOn':
          return { result: { value: true } };
        default:
          throw new Error(`unexpected CDP call: ${method}`);
      }
    });
    const condition: PostCondition = { type: 'element_hidden', selector: '#banner' };

    const result = await evaluatePostCondition(condition, cdp);

    expect(result).toEqual(ok(false));
  });

  it('fails with POST_CONDITION_CHECK_FAILED when the document cannot be read', async () => {
    const cdp = await fakeCdp((method) => {
      if (method === 'DOM.getDocument') {
        return new CdpError('CDP_SEND_FAILED', 'detached');
      }
      throw new Error(`unexpected CDP call: ${method}`);
    });
    const condition: PostCondition = { type: 'element_visible', selector: '#banner' };

    const result = await evaluatePostCondition(condition, cdp);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('POST_CONDITION_CHECK_FAILED');
  });

  it('evaluates url_matches against the current page URL', async () => {
    const cdp = await fakeCdp((method) => {
      if (method === 'Runtime.evaluate') {
        return { result: { value: 'https://example.com/checkout/confirm' } };
      }
      throw new Error(`unexpected CDP call: ${method}`);
    });
    const condition: PostCondition = { type: 'url_matches', pattern: '/checkout/confirm$' };

    const result = await evaluatePostCondition(condition, cdp);

    expect(result).toEqual(ok(true));
  });

  it('reports url_matches false when the pattern does not match', async () => {
    const cdp = await fakeCdp((method) => {
      if (method === 'Runtime.evaluate') {
        return { result: { value: 'https://example.com/cart' } };
      }
      throw new Error(`unexpected CDP call: ${method}`);
    });
    const condition: PostCondition = { type: 'url_matches', pattern: '/checkout/confirm$' };

    const result = await evaluatePostCondition(condition, cdp);

    expect(result).toEqual(ok(false));
  });

  it('evaluates text_contains against the page body text', async () => {
    const cdp = await fakeCdp((method) => {
      if (method === 'Runtime.evaluate') {
        return { result: { value: 'Order confirmed. Thank you!' } };
      }
      throw new Error(`unexpected CDP call: ${method}`);
    });
    const condition: PostCondition = { type: 'text_contains', text: 'Order confirmed' };

    const result = await evaluatePostCondition(condition, cdp);

    expect(result).toEqual(ok(true));
  });

  it('fails with POST_CONDITION_CHECK_FAILED when Runtime.evaluate reports an exception', async () => {
    const cdp = await fakeCdp((method) => {
      if (method === 'Runtime.evaluate') {
        return { result: {}, exceptionDetails: { text: 'boom' } };
      }
      throw new Error(`unexpected CDP call: ${method}`);
    });
    const condition: PostCondition = { type: 'text_contains', text: 'Order confirmed' };

    const result = await evaluatePostCondition(condition, cdp);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('POST_CONDITION_CHECK_FAILED');
  });
});

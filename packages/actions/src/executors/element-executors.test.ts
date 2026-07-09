import { CdpError, createFakeCdp } from '@aegis/perception';
import { err, isErr, isOk, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import {
  executeClick,
  executeGetDropdownOptions,
  executeInputText,
  executeScroll,
  executeSelectDropdownOption,
  executeSendKeys,
} from './element-executors';

function ref(value: string) {
  return toElementRef(value);
}

describe('executeClick', () => {
  it('resolves the ref, scrolls into view, and dispatches a press+release at the element center', async () => {
    const calls: unknown[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        calls.push([method, params]);
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        if (method === 'DOM.getBoxModel') {
          return ok({ model: { border: [0, 0, 100, 0, 100, 40, 0, 40] } });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeClick(cdp, { type: 'click', ref: ref('ax:1') });

    expect(isOk(result) && result.value).toEqual({ kind: 'click' });
    expect(calls).toContainEqual(['DOM.scrollIntoViewIfNeeded', { backendNodeId: 1 }]);
    expect(calls).toContainEqual([
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', x: 50, y: 20, button: 'left', clickCount: 1 },
    ]);
    expect(calls).toContainEqual([
      'Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: 50, y: 20, button: 'left', clickCount: 1 },
    ]);
  });

  it('propagates a ref-not-found failure', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();

    const result = await executeClick(cdp, { type: 'click', ref: ref('bogus') });

    expect(isErr(result) && result.error.code).toBe('REF_NOT_FOUND');
  });

  it('fails gracefully when the element has no bounds (detached)', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        if (method === 'DOM.getBoxModel') {
          return ok({ model: { border: [1, 2, 3] } }); // malformed quad
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeClick(cdp, { type: 'click', ref: ref('ax:1') });

    expect(isErr(result) && result.error.code).toBe('ELEMENT_DETACHED');
  });
});

describe('executeInputText', () => {
  it('focuses the element and inserts text', async () => {
    const calls: unknown[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        calls.push([method, params]);
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeInputText(cdp, {
      type: 'input_text',
      ref: ref('ax:1'),
      text: 'hello',
    });

    expect(isOk(result) && result.value).toEqual({ kind: 'input_text' });
    expect(calls).toContainEqual(['Input.insertText', { text: 'hello' }]);
  });

  it('selects existing content before inserting new text, so insertText replaces it', async () => {
    const calls: [string, unknown][] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        calls.push([method, params]);
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    await executeInputText(cdp, { type: 'input_text', ref: ref('ax:1'), text: 'hello' });

    const methods = calls.map(([method]) => method);
    const functionOnCount = methods.filter((method) => method === 'Runtime.callFunctionOn').length;
    expect(functionOnCount).toBe(2); // focus() then select-all-content
    expect(methods.lastIndexOf('Runtime.callFunctionOn')).toBeLessThan(
      methods.indexOf('Input.insertText'),
    );
  });

  it('propagates a focus failure', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        if (method === 'Runtime.callFunctionOn') {
          return err(new CdpError('CDP_SEND_FAILED', 'no focus'));
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeInputText(cdp, {
      type: 'input_text',
      ref: ref('ax:1'),
      text: 'hi',
    });

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });

  it('propagates a select-content failure', async () => {
    let functionOnCalls = 0;
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        if (method === 'Runtime.callFunctionOn') {
          functionOnCalls += 1;
          if (functionOnCalls === 1) {
            return ok({ result: { type: 'undefined' } }); // focus succeeds
          }
          return err(new CdpError('CDP_SEND_FAILED', 'no select'));
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeInputText(cdp, {
      type: 'input_text',
      ref: ref('ax:1'),
      text: 'hi',
    });

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
    expect(isErr(result) && result.error.message).toContain('select');
  });
});

describe('executeScroll', () => {
  it('dispatches a mouseWheel at the origin when no ref is given', async () => {
    const calls: unknown[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        calls.push([method, params]);
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeScroll(cdp, { type: 'scroll', direction: 'down' });

    expect(isOk(result)).toBe(true);
    expect(calls).toContainEqual([
      'Input.dispatchMouseEvent',
      { type: 'mouseWheel', x: 0, y: 0, deltaX: 0, deltaY: 300 },
    ]);
  });

  it('scrolls at the element center and respects a custom amount and direction', async () => {
    const calls: unknown[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        calls.push([method, params]);
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        if (method === 'DOM.getBoxModel') {
          return ok({ model: { border: [0, 0, 20, 0, 20, 20, 0, 20] } });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeScroll(cdp, {
      type: 'scroll',
      ref: ref('ax:1'),
      direction: 'up',
      amount: 50,
    });

    expect(isOk(result)).toBe(true);
    expect(calls).toContainEqual([
      'Input.dispatchMouseEvent',
      { type: 'mouseWheel', x: 10, y: 10, deltaX: 0, deltaY: -50 },
    ]);
  });
});

describe('executeGetDropdownOptions', () => {
  it('returns the option value/label pairs', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        if (method === 'Runtime.callFunctionOn') {
          return ok({
            result: {
              type: 'object',
              value: [
                { value: 'us', label: 'United States' },
                { value: 'ca', label: 'Canada' },
              ],
            },
          });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeGetDropdownOptions(cdp, {
      type: 'get_dropdown_options',
      ref: ref('ax:1'),
    });

    expect(isOk(result) && result.value.options).toEqual([
      { value: 'us', label: 'United States' },
      { value: 'ca', label: 'Canada' },
    ]);
  });

  it('fails when the target is not a <select> element', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        if (method === 'Runtime.callFunctionOn') {
          return ok({ result: { type: 'object', value: 'not-an-array' } });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeGetDropdownOptions(cdp, {
      type: 'get_dropdown_options',
      ref: ref('ax:1'),
    });

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });
});

describe('executeSelectDropdownOption', () => {
  it('sets the value and dispatches a change event', async () => {
    const calls: unknown[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        calls.push([method, params]);
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        return ok({ result: { type: 'undefined' } });
      },
    });
    await cdp.attach();

    const result = await executeSelectDropdownOption(cdp, {
      type: 'select_dropdown_option',
      ref: ref('ax:1'),
      value: 'ca',
    });

    expect(isOk(result) && result.value).toEqual({ kind: 'select_dropdown_option' });
    expect(calls).toContainEqual([
      'Runtime.callFunctionOn',
      expect.objectContaining({ objectId: 'obj-1', arguments: [{ value: 'ca' }] }),
    ]);
  });
});

describe('executeSendKeys', () => {
  it('dispatches keyDown and keyUp without a ref', async () => {
    const calls: unknown[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        calls.push([method, params]);
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeSendKeys(cdp, { type: 'send_keys', keys: 'Enter' });

    expect(isOk(result) && result.value).toEqual({ kind: 'send_keys' });
    expect(calls).toContainEqual([
      'Input.dispatchKeyEvent',
      expect.objectContaining({ type: 'keyDown', key: 'Enter' }),
    ]);
    expect(calls).toContainEqual([
      'Input.dispatchKeyEvent',
      expect.objectContaining({ type: 'keyUp', key: 'Enter' }),
    ]);
  });

  it('focuses the ref first when one is given', async () => {
    const calls: string[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        calls.push(method);
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    await executeSendKeys(cdp, { type: 'send_keys', ref: ref('ax:1'), keys: 'Ctrl+A' });

    expect(calls.indexOf('Runtime.callFunctionOn')).toBeLessThan(
      calls.indexOf('Input.dispatchKeyEvent'),
    );
  });
});

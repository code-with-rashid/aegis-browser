import { CdpError, createFakeCdp } from '@aegis/perception';
import { err, isErr, isOk, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createFakeTabManager } from '../tabs/fake-tab-manager';
import { executeAction } from './dispatch';

describe('executeAction', () => {
  it('dispatches a "done" action without touching CDP', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);

    const result = await executeAction(
      { session: cdp, tabManager },
      { type: 'done', success: true, summary: 'Task complete' },
    );

    expect(isOk(result) && result.value).toEqual({
      kind: 'done',
      success: true,
      summary: 'Task complete',
    });
  });

  it('dispatches a "wait" action', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);

    const result = await executeAction({ session: cdp, tabManager }, { type: 'wait', ms: 5 });

    expect(isOk(result) && result.value).toEqual({ kind: 'wait' });
  });

  it('dispatches a click action against CDP', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'DOM.resolveNode') {
          return ok({ object: { type: 'object', objectId: 'obj-1' } });
        }
        if (method === 'DOM.getBoxModel') {
          return ok({ model: { border: [0, 0, 10, 0, 10, 10, 0, 10] } });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);

    const result = await executeAction(
      { session: cdp, tabManager },
      { type: 'click', ref: toElementRef('ax:1') },
    );

    expect(isOk(result) && result.value).toEqual({ kind: 'click' });
  });

  it('dispatches an open_tab action through the tab manager', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);

    const result = await executeAction({ session: cdp, tabManager }, { type: 'open_tab' });

    expect(isOk(result) && result.value).toEqual({ kind: 'open_tab', tabId: 2 });
  });

  it('attaches a screenshot to a failed action when capture succeeds', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'Page.captureScreenshot') {
          return ok({ data: 'imgdata' });
        }
        return err(new CdpError('CDP_SEND_FAILED', 'node gone'));
      },
    });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);

    const result = await executeAction(
      { session: cdp, tabManager },
      { type: 'click', ref: toElementRef('ax:1') },
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('ELEMENT_DETACHED');
      expect(result.error.screenshot).toEqual({ data: 'imgdata', format: 'png' });
    }
  });

  it('returns the original error unchanged when screenshot capture also fails', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => err(new CdpError('CDP_SEND_FAILED', 'no screenshot either')),
    });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);

    const result = await executeAction(
      { session: cdp, tabManager },
      { type: 'click', ref: toElementRef('ax:1') },
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('ELEMENT_DETACHED');
      expect(result.error.screenshot).toBeUndefined();
    }
  });
});

import { CdpError, createFakeCdp } from '@aegis/perception';
import { err, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createFakeTabManager } from '../tabs/fake-tab-manager';
import { createActionRunner } from './action-runner';

function clickableCdp() {
  return createFakeCdp(1, {
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
}

describe('createActionRunner', () => {
  it('runs a list of actions sequentially and reports completed', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);
    const runner = createActionRunner();

    const outcome = await runner.run(
      [
        { type: 'wait', ms: 1 },
        { type: 'done', success: true, summary: 'done' },
      ],
      { session: cdp, tabManager },
    );

    expect(outcome.kind).toBe('completed');
    expect(outcome.results).toHaveLength(2);
    expect(runner.history).toHaveLength(2);
  });

  it('retries a transient failure before succeeding', async () => {
    let attempts = 0;
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'Page.navigate') {
          attempts += 1;
          return attempts < 2
            ? err(new CdpError('CDP_SEND_FAILED', 'transient'))
            : ok({ frameId: 'f1' });
        }
        if (method === 'Page.captureScreenshot') {
          return ok({ data: 'imgdata' });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);
    const runner = createActionRunner();

    const outcome = await runner.run(
      [{ type: 'navigate', url: 'https://example.com' }],
      { session: cdp, tabManager },
      { maxRetries: 2, retryDelayMs: 0 },
    );

    expect(outcome.kind).toBe('completed');
    expect(runner.history[0]?.attempt).toBe(2);
  });

  it('reports "failed" after exhausting retries', async () => {
    const cdp = createFakeCdp(1, { onSend: () => err(new CdpError('CDP_SEND_FAILED', 'boom')) });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);
    const runner = createActionRunner();

    const outcome = await runner.run(
      [{ type: 'navigate', url: 'https://example.com' }],
      { session: cdp, tabManager },
      { maxRetries: 1, retryDelayMs: 0 },
    );

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.failedAction).toEqual({ type: 'navigate', url: 'https://example.com' });
    }
    expect(runner.history[0]?.attempt).toBe(2);
  });

  it('detects a stall when the same action repeats across run() calls', async () => {
    const cdp = clickableCdp();
    await cdp.attach();
    const tabManager = createFakeTabManager(1);
    const runner = createActionRunner();
    const clickAction = { type: 'click', ref: toElementRef('ax:1') } as const;

    const first = await runner.run(
      [clickAction],
      { session: cdp, tabManager },
      { stallThreshold: 3 },
    );
    const second = await runner.run(
      [clickAction],
      { session: cdp, tabManager },
      { stallThreshold: 3 },
    );
    const third = await runner.run(
      [clickAction],
      { session: cdp, tabManager },
      { stallThreshold: 3 },
    );

    expect(first.kind).toBe('completed');
    expect(second.kind).toBe('completed');
    expect(third.kind).toBe('stalled');
    if (third.kind === 'stalled') {
      expect(third.stalledOn).toEqual(clickAction);
    }
    // the 3rd call never executed the action, so only 2 real executions were recorded
    expect(runner.history).toHaveLength(2);
  });

  it('does not flag a stall when the target differs between calls', async () => {
    const cdp = clickableCdp();
    await cdp.attach();
    const tabManager = createFakeTabManager(1);
    const runner = createActionRunner();

    const first = await runner.run(
      [{ type: 'click', ref: toElementRef('ax:1') }],
      { session: cdp, tabManager },
      { stallThreshold: 2 },
    );
    const second = await runner.run(
      [{ type: 'click', ref: toElementRef('ax:2') }],
      { session: cdp, tabManager },
      { stallThreshold: 2 },
    );

    expect(first.kind).toBe('completed');
    expect(second.kind).toBe('completed');
  });

  it('reports "aborted" immediately when the signal is already aborted', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);
    const runner = createActionRunner();
    const controller = new AbortController();
    controller.abort();

    const outcome = await runner.run(
      [{ type: 'wait', ms: 10 }],
      { session: cdp, tabManager },
      { signal: controller.signal },
    );

    expect(outcome.kind).toBe('aborted');
    expect(outcome.results).toHaveLength(0);
  });

  it('stops retrying once the signal aborts mid-run', async () => {
    const cdp = createFakeCdp(1, { onSend: () => err(new CdpError('CDP_SEND_FAILED', 'boom')) });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);
    const runner = createActionRunner();
    const controller = new AbortController();

    const runPromise = runner.run(
      [{ type: 'navigate', url: 'https://example.com' }],
      { session: cdp, tabManager },
      { maxRetries: 5, retryDelayMs: 100, signal: controller.signal },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();

    const outcome = await runPromise;

    expect(outcome.kind).toBe('aborted');
  });

  it('reset() clears captured history', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();
    const tabManager = createFakeTabManager(1);
    const runner = createActionRunner();

    await runner.run([{ type: 'wait', ms: 1 }], { session: cdp, tabManager });
    expect(runner.history).toHaveLength(1);

    runner.reset();
    expect(runner.history).toHaveLength(0);
  });
});

import {
  createActionRunner,
  createDefaultToolRegistry,
  createFakeTabManager,
  ToolExecutionError,
  ToolRegistry,
  type ExecutorContext,
} from '@aegis/actions';
import { CdpError, createFakeCdp, type FakeCdpOptions } from '@aegis/perception';
import { err, isErr, isOk, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createToolCallActService } from './act-service';

function contextFor(options: FakeCdpOptions = {}): ExecutorContext {
  return { session: createFakeCdp(1, options), tabManager: createFakeTabManager(1) };
}

describe('createToolCallActService', () => {
  it('runs a browser tool call through the action runner and reports completed', async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const act = createToolCallActService(createActionRunner(), createDefaultToolRegistry());

    const outcome = await act([{ toolId: 'browser.wait', args: { type: 'wait', ms: 1 } }], context);

    expect(outcome.kind).toBe('completed');
    const first = outcome.results[0];
    expect(first !== undefined && isOk(first.outcome) && first.outcome.value).toEqual({
      kind: 'wait',
    });
  });

  it('calls a non-browser tool straight through the registry', async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = createDefaultToolRegistry();
    let called = false;
    registry.register({
      id: 'mcp.weather.lookup',
      source: 'mcp',
      description: 'Look up the weather.',
      inputSchema: z.object({ city: z.string() }),
      risk: 'read',
      execute: () => {
        called = true;
        return Promise.resolve(ok({ tempC: 20 }));
      },
    });
    const act = createToolCallActService(createActionRunner(), registry);

    const outcome = await act(
      [{ toolId: 'mcp.weather.lookup', args: { city: 'London' } }],
      context,
    );

    expect(outcome.kind).toBe('completed');
    expect(called).toBe(true);
    const first = outcome.results[0];
    expect(first !== undefined && isOk(first.outcome) && first.outcome.value).toEqual({
      tempC: 20,
    });
  });

  it('reports failed with the failing tool call when a browser action errors out', async () => {
    const context = contextFor({ onSend: () => err(new CdpError('CDP_SEND_FAILED', 'boom')) });
    await context.session.attach();
    const act = createToolCallActService(createActionRunner(), createDefaultToolRegistry());

    const outcome = await act(
      [{ toolId: 'browser.click', args: { type: 'click', ref: toElementRef('ax:1') } }],
      context,
    );

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.failedToolCall.toolId).toBe('browser.click');
      const first = outcome.results[0];
      expect(first !== undefined && isErr(first.outcome) && first.outcome.error.code).toBe(
        'TOOL_EXECUTION_FAILED',
      );
    }
  });

  it('reports failed with the failing tool call when a non-browser tool errors out', async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'mcp.broken.tool',
      source: 'mcp',
      description: 'Always fails.',
      inputSchema: z.object({}),
      risk: 'read',
      execute: () => Promise.resolve(err(new ToolExecutionError('TOOL_EXECUTION_FAILED', 'nope'))),
    });
    const act = createToolCallActService(createActionRunner(), registry);

    const outcome = await act([{ toolId: 'mcp.broken.tool', args: {} }], context);

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.failedToolCall.toolId).toBe('mcp.broken.tool');
    }
  });

  it('reports aborted when the signal is already aborted', async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const act = createToolCallActService(createActionRunner(), createDefaultToolRegistry());
    const controller = new AbortController();
    controller.abort();

    const outcome = await act(
      [{ toolId: 'browser.wait', args: { type: 'wait', ms: 1 } }],
      context,
      controller.signal,
    );

    expect(outcome.kind).toBe('aborted');
  });
});

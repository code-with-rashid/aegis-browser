import { ToolRegistry } from '@aegis/actions';
import { isErr, isOk } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createFakeWebMcpSource, webMcpTextResult } from '../testing/fake-webmcp-source';
import { registerWebMcpTools } from './register-webmcp-tools';

describe('registerWebMcpTools', () => {
  it('registers each declared tool as web.<name>', async () => {
    const registry = new ToolRegistry();
    const source = createFakeWebMcpSource([
      { name: 'add_to_cart', handler: () => webMcpTextResult('added') },
      { name: 'checkout', handler: () => webMcpTextResult('done') },
    ]);

    const result = await registerWebMcpTools(registry, source);

    expect(isOk(result) && [...result.value.toolIds].sort()).toEqual([
      'web.add_to_cart',
      'web.checkout',
    ]);
    expect(registry.has('web.add_to_cart')).toBe(true);
    expect(registry.get('web.add_to_cart')?.source).toBe('webmcp');
  });

  it('is a clean, silent no-op when the page declares no WebMCP tools at all', async () => {
    const registry = new ToolRegistry();
    const source = createFakeWebMcpSource([]);

    const result = await registerWebMcpTools(registry, source);

    expect(isOk(result) && result.value.toolIds).toEqual([]);
    expect(registry.list({ source: 'webmcp' })).toEqual([]);
  });

  it('infers risk from annotations, failing safe when none are declared', async () => {
    const registry = new ToolRegistry();
    const source = createFakeWebMcpSource([
      {
        name: 'read_price',
        annotations: { readOnlyHint: true },
        handler: () => webMcpTextResult('$5'),
      },
      { name: 'checkout', handler: () => webMcpTextResult('done') },
    ]);

    await registerWebMcpTools(registry, source);

    expect(registry.get('web.read_price')?.risk).toBe('read');
    expect(registry.get('web.checkout')?.risk).toBe('state_changing');
  });

  it("executes a registered tool through the registry, using the tool's own inputSchema", async () => {
    const registry = new ToolRegistry();
    const source = createFakeWebMcpSource([
      {
        name: 'add_to_cart',
        inputSchema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
        handler: (args) => webMcpTextResult(`added ${(args as { sku: string }).sku}`),
      },
    ]);
    await registerWebMcpTools(registry, source);

    const callResult = await registry.call(
      'web.add_to_cart',
      { sku: 'oat-milk' },
      { session: undefined as never, tabManager: undefined as never },
    );

    expect(isOk(callResult) && callResult.value).toBe('added oat-milk');
  });

  it('surfaces a tool-level isError result as a ToolExecutionError', async () => {
    const registry = new ToolRegistry();
    const source = createFakeWebMcpSource([
      { name: 'checkout', handler: () => webMcpTextResult('out of stock', true) },
    ]);
    await registerWebMcpTools(registry, source);

    const callResult = await registry.call(
      'web.checkout',
      {},
      { session: undefined as never, tabManager: undefined as never },
    );

    expect(isErr(callResult) && callResult.error.code).toBe('TOOL_EXECUTION_FAILED');
    expect(isErr(callResult) && callResult.error.message).toBe('out of stock');
  });

  it('resyncs when the page changes its tool list: registers new tools, unregisters removed ones', async () => {
    const registry = new ToolRegistry();
    const source = createFakeWebMcpSource([
      { name: 'add_to_cart', handler: () => webMcpTextResult('added') },
    ]);
    await registerWebMcpTools(registry, source);
    expect(registry.has('web.add_to_cart')).toBe(true);

    source.setTools([{ name: 'checkout', handler: () => webMcpTextResult('done') }]);
    // onToolsChanged's resync is fire-and-forget; give its promise a tick to settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(registry.has('web.add_to_cart')).toBe(false);
    expect(registry.has('web.checkout')).toBe(true);
  });

  it('unregister() removes every currently-registered tool and stops future resyncs', async () => {
    const registry = new ToolRegistry();
    const source = createFakeWebMcpSource([
      { name: 'add_to_cart', handler: () => webMcpTextResult('added') },
    ]);
    const result = await registerWebMcpTools(registry, source);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }

    result.value.unregister();
    expect(registry.has('web.add_to_cart')).toBe(false);

    source.setTools([{ name: 'checkout', handler: () => webMcpTextResult('done') }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(registry.has('web.checkout')).toBe(false);
  });

  it('fails without registering anything when the initial listTools() call fails', async () => {
    const registry = new ToolRegistry();
    const source = createFakeWebMcpSource([]);
    const failingSource = {
      ...source,
      listTools: () => Promise.resolve({ ok: false as const, error: { message: 'page threw' } }),
    };

    const result = await registerWebMcpTools(registry, failingSource);

    expect(isErr(result) && result.error.message).toBe('page threw');
    expect(registry.list()).toHaveLength(0);
  });
});

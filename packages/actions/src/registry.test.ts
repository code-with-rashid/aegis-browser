import { isErr, isOk, ok } from '@aegis/shared';
import { createFakeCdp } from '@aegis/perception';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createFakeTabManager } from './tabs/fake-tab-manager';
import { createDefaultToolRegistry } from './browser-tools';
import { ToolRegistry } from './registry';
import type { ToolContext } from './tool';

function createContext(): ToolContext {
  return {
    session: createFakeCdp(1, { onSend: () => ok(undefined) }),
    tabManager: createFakeTabManager(1),
  };
}

describe('createDefaultToolRegistry', () => {
  it('registers all 14 built-in browser tools', () => {
    const registry = createDefaultToolRegistry();
    expect(registry.list()).toHaveLength(14);
    expect(registry.has('browser.click')).toBe(true);
    expect(registry.has('browser.done')).toBe(true);
  });

  it('filters by source', () => {
    const registry = createDefaultToolRegistry();
    expect(registry.list({ source: 'browser' })).toHaveLength(14);
    expect(registry.list({ source: 'mcp' })).toHaveLength(0);
  });

  it('filters by risk', () => {
    const registry = createDefaultToolRegistry();
    const readTools = registry.list({ risk: 'read' });
    expect(readTools.map((t) => t.id).sort()).toEqual([
      'browser.done',
      'browser.extract',
      'browser.get_dropdown_options',
      'browser.wait',
    ]);
  });

  it('calls a registered tool and returns its typed result', async () => {
    const registry = createDefaultToolRegistry();
    const ctx = createContext();

    const result = await registry.call(
      'browser.done',
      { type: 'done', success: true, summary: 'ok' },
      ctx,
    );

    expect(isOk(result) && result.value).toEqual({ kind: 'done', success: true, summary: 'ok' });
  });

  it('rejects an unknown tool id', async () => {
    const registry = createDefaultToolRegistry();
    const ctx = createContext();

    const result = await registry.call('browser.teleport', {}, ctx);

    expect(isErr(result) && result.error.code).toBe('TOOL_UNKNOWN');
  });

  it('rejects schema-invalid args for a known tool', async () => {
    const registry = createDefaultToolRegistry();
    const ctx = createContext();

    const result = await registry.call('browser.click', { type: 'click' }, ctx); // missing ref

    expect(isErr(result) && result.error.code).toBe('TOOL_INVALID_ARGS');
  });
});

describe('ToolRegistry extensibility (MCP/WebMCP-style custom registration)', () => {
  it('lets a caller register a tool from another source', async () => {
    const registry = new ToolRegistry();
    const customSchema = z.object({ query: z.string() });

    registry.register({
      id: 'mcp.weather.lookup',
      source: 'mcp',
      description: 'Look up the weather.',
      inputSchema: customSchema,
      risk: 'read',
      execute: (args) => Promise.resolve(ok({ echoed: args })),
    });

    const ctx = createContext();
    const result = await registry.call('mcp.weather.lookup', { query: 'weather' }, ctx);

    expect(isOk(result) && result.value).toEqual({ echoed: { query: 'weather' } });
    expect(registry.list({ source: 'mcp' })).toHaveLength(1);
  });

  it('unregisters a tool', () => {
    const registry = new ToolRegistry();
    registry.register({
      id: 'webmcp.checkout',
      source: 'webmcp',
      description: 'Checkout.',
      inputSchema: z.object({}),
      risk: 'state_changing',
      execute: () => Promise.resolve(ok(undefined)),
    });

    expect(registry.has('webmcp.checkout')).toBe(true);
    registry.unregister('webmcp.checkout');
    expect(registry.has('webmcp.checkout')).toBe(false);
  });

  it('starts empty when constructed directly (no built-ins)', () => {
    const registry = new ToolRegistry();
    expect(registry.list()).toHaveLength(0);
  });
});

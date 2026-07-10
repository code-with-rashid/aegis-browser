import { CdpError, createFakeCdp } from '@aegis/perception';
import { err, isErr, isOk, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createFakeTabManager } from './tabs/fake-tab-manager';
import { createBrowserTools, createDefaultToolRegistry } from './browser-tools';
import type { Tool, ToolContext } from './tool';

function getBrowserTool(id: string): Tool {
  const tool = createBrowserTools().find((t) => t.id === id);
  if (tool === undefined) {
    throw new Error(`test setup: tool "${id}" not found`);
  }
  return tool;
}

describe('createBrowserTools', () => {
  it('creates one tool per built-in action type, namespaced "browser.<type>"', () => {
    const tools = createBrowserTools();
    expect(tools).toHaveLength(14);
    expect(tools.map((t) => t.id)).toContain('browser.click');
    expect(tools.every((t) => t.source === 'browser')).toBe(true);
  });

  it('gives each tool a description and a Zod input schema', () => {
    const tools = createBrowserTools();
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.inputSchema.safeParse).toBe('function');
    }
  });

  it('matches classifyActionRisk-style base risk per type', () => {
    const tools = createBrowserTools();
    const byId = new Map(tools.map((t) => [t.id, t]));
    expect(byId.get('browser.click')?.risk).toBe('input');
    expect(byId.get('browser.navigate')?.risk).toBe('navigate');
    expect(byId.get('browser.extract')?.risk).toBe('read');
  });

  it('executes a click tool against CDP, matching executeAction output', async () => {
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
    const ctx: ToolContext = { session: cdp, tabManager: createFakeTabManager(1) };

    const clickTool = getBrowserTool('browser.click');
    const result = await clickTool.execute({ type: 'click', ref: toElementRef('ax:1') }, ctx);

    expect(isOk(result) && result.value).toEqual({ kind: 'click' });
  });

  it('wraps an execution failure as a ToolExecutionError, preserving the cause', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => err(new CdpError('CDP_SEND_FAILED', 'node gone')),
    });
    await cdp.attach();
    const ctx: ToolContext = { session: cdp, tabManager: createFakeTabManager(1) };

    const clickTool = getBrowserTool('browser.click');
    const result = await clickTool.execute({ type: 'click', ref: toElementRef('ax:1') }, ctx);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
      expect(result.error.cause).toBeInstanceOf(Error);
    }
  });
});

describe('createDefaultToolRegistry', () => {
  it('round-trips a full tool call through the registry (validate + execute)', async () => {
    const registry = createDefaultToolRegistry();
    const ctx: ToolContext = {
      session: createFakeCdp(1, { onSend: () => ok(undefined) }),
      tabManager: createFakeTabManager(1),
    };

    const result = await registry.call('browser.wait', { type: 'wait', ms: 1 }, ctx);

    expect(isOk(result) && result.value).toEqual({ kind: 'wait' });
  });
});

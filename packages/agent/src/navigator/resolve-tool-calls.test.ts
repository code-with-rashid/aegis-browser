import { createDefaultToolRegistry, ToolRegistry } from '@aegis/actions';
import { isErr, isOk, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { resolveToolCalls } from './resolve-tool-calls';

describe('resolveToolCalls', () => {
  it('resolves a valid browser tool call into both a ToolCall and a branded Action', () => {
    const registry = createDefaultToolRegistry();

    const result = resolveToolCalls(
      [{ toolId: 'browser.click', args: { type: 'click', ref: 'ax:1' } }],
      registry,
    );

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.toolCalls).toEqual([
        { toolId: 'browser.click', args: { type: 'click', ref: toElementRef('ax:1') } },
      ]);
      expect(result.value.actions).toEqual([{ type: 'click', ref: toElementRef('ax:1') }]);
    }
  });

  it('resolves a non-browser tool call into a ToolCall only, never the derived actions', () => {
    const registry = new ToolRegistry();
    registry.register({
      id: 'mcp.weather.lookup',
      source: 'mcp',
      description: 'Look up the weather.',
      inputSchema: z.object({ city: z.string() }),
      risk: 'read',
      execute: () => Promise.resolve({ ok: true, value: undefined }),
    });

    const result = resolveToolCalls(
      [{ toolId: 'mcp.weather.lookup', args: { city: 'Lagos' } }],
      registry,
    );

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.toolCalls).toEqual([
        { toolId: 'mcp.weather.lookup', args: { city: 'Lagos' } },
      ]);
      expect(result.value.actions).toEqual([]);
    }
  });

  it('reports an issue for an unknown tool id', () => {
    const registry = createDefaultToolRegistry();

    const result = resolveToolCalls([{ toolId: 'browser.teleport', args: {} }], registry);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual([
        { toolId: 'browser.teleport', reason: 'Unknown tool "browser.teleport"' },
      ]);
    }
  });

  it('reports an issue for schema-invalid args on a known tool', () => {
    const registry = createDefaultToolRegistry();

    const result = resolveToolCalls(
      [{ toolId: 'browser.click', args: { type: 'click' } }],
      registry,
    ); // missing ref

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toHaveLength(1);
      expect(result.error[0]?.toolId).toBe('browser.click');
      expect(result.error[0]?.reason).toContain('Invalid args');
    }
  });

  it('fails the whole batch when only one of several calls has an issue', () => {
    const registry = createDefaultToolRegistry();

    const result = resolveToolCalls(
      [
        { toolId: 'browser.click', args: { type: 'click', ref: 'ax:1' } },
        { toolId: 'browser.unknown', args: {} },
      ],
      registry,
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual([
        { toolId: 'browser.unknown', reason: 'Unknown tool "browser.unknown"' },
      ]);
    }
  });
});

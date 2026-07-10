import { createMemoryStorage } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createMcpToolPolicyStore } from './mcp-tool-policy-store';
import type { McpToolPolicy } from './mcp-tool-policy';

function unwrap<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value as T;
}

describe('createMcpToolPolicyStore', () => {
  it('returns undefined for a tool id with no stored policy', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    expect(unwrap(await store.getPolicy('mcp.weather.get_forecast'))).toBeUndefined();
  });

  it('round-trips a set policy', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    const policy: McpToolPolicy = { toolId: 'mcp.weather.get_forecast', mode: 'allow' };

    expect((await store.setPolicy(policy)).ok).toBe(true);
    expect(unwrap(await store.getPolicy('mcp.weather.get_forecast'))).toEqual(policy);
  });

  it('keeps policies for different tool ids independent', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    const a: McpToolPolicy = { toolId: 'mcp.weather.get_forecast', mode: 'allow' };
    const b: McpToolPolicy = { toolId: 'mcp.weather.delete_account', mode: 'deny' };

    await store.setPolicy(a);
    await store.setPolicy(b);

    expect(unwrap(await store.getPolicy('mcp.weather.get_forecast'))).toEqual(a);
    expect(unwrap(await store.getPolicy('mcp.weather.delete_account'))).toEqual(b);
  });

  it('overwrites a policy set again for the same tool id', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    const toolId = 'mcp.weather.get_forecast';
    await store.setPolicy({ toolId, mode: 'deny' });
    await store.setPolicy({ toolId, mode: 'allow' });

    expect(unwrap(await store.getPolicy(toolId))).toEqual({ toolId, mode: 'allow' });
  });

  it('removes a policy', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    const toolId = 'mcp.weather.get_forecast';
    await store.setPolicy({ toolId, mode: 'allow' });

    expect((await store.removePolicy(toolId)).ok).toBe(true);
    expect(unwrap(await store.getPolicy(toolId))).toBeUndefined();
  });

  it('removing a never-set tool id is a no-op that still succeeds', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    expect((await store.removePolicy('mcp.weather.get_forecast')).ok).toBe(true);
  });

  it('lists every stored policy', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    const a: McpToolPolicy = { toolId: 'mcp.weather.get_forecast', mode: 'allow' };
    const b: McpToolPolicy = { toolId: 'mcp.weather.delete_account', mode: 'deny' };
    await store.setPolicy(a);
    await store.setPolicy(b);

    const listed = unwrap(await store.listPolicies());
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining([a, b]));
  });

  it('lists an empty array when nothing is stored', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    expect(unwrap(await store.listPolicies())).toEqual([]);
  });
});

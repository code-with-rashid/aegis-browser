import { createMemoryStorage, isOk } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import type { McpToolDescriptor } from '../client/mcp-client';
import { createMcpToolPolicyStore } from './mcp-tool-policy-store';
import { gateMcpTools } from './gate-mcp-tools';

function descriptor(name: string): McpToolDescriptor {
  return { name, inputSchema: { type: 'object' } };
}

describe('gateMcpTools', () => {
  it('excludes a never-seen tool, recording it deny (pending) and reporting it as newly discovered', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());

    const result = await gateMcpTools('weather', [descriptor('get_forecast')], store);

    expect(isOk(result) && result.value).toEqual({
      allowed: [],
      newlyDiscoveredToolIds: ['mcp.weather.get_forecast'],
    });
    const stored = await store.getPolicy('mcp.weather.get_forecast');
    expect(isOk(stored) && stored.value).toEqual({
      toolId: 'mcp.weather.get_forecast',
      mode: 'deny',
    });
  });

  it('excludes an explicitly denied tool, without re-reporting it as newly discovered', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    await store.setPolicy({ toolId: 'mcp.weather.delete_account', mode: 'deny' });

    const result = await gateMcpTools('weather', [descriptor('delete_account')], store);

    expect(isOk(result) && result.value).toEqual({ allowed: [], newlyDiscoveredToolIds: [] });
  });

  it('includes an explicitly allowed tool', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    await store.setPolicy({ toolId: 'mcp.weather.get_forecast', mode: 'allow' });
    const forecast = descriptor('get_forecast');

    const result = await gateMcpTools('weather', [forecast], store);

    expect(isOk(result) && result.value).toEqual({
      allowed: [forecast],
      newlyDiscoveredToolIds: [],
    });
  });

  it('gates a mixed batch independently per tool', async () => {
    const store = createMcpToolPolicyStore(createMemoryStorage());
    await store.setPolicy({ toolId: 'mcp.weather.get_forecast', mode: 'allow' });
    await store.setPolicy({ toolId: 'mcp.weather.delete_account', mode: 'deny' });
    const forecast = descriptor('get_forecast');

    const result = await gateMcpTools(
      'weather',
      [forecast, descriptor('delete_account'), descriptor('brand_new_tool')],
      store,
    );

    expect(isOk(result) && result.value).toEqual({
      allowed: [forecast],
      newlyDiscoveredToolIds: ['mcp.weather.brand_new_tool'],
    });
  });
});

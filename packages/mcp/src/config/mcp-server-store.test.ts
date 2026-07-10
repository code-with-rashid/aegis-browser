import { createMemoryStorage, isOk } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createMcpServerStore } from './mcp-server-store';
import type { McpServerConnectionConfig } from './mcp-server-config';

function serverFixture(
  overrides: Partial<McpServerConnectionConfig> = {},
): McpServerConnectionConfig {
  return {
    url: 'https://mcp.example.com/mcp',
    name: 'Example MCP server',
    authHeaders: [],
    enabled: true,
    ...overrides,
  };
}

describe('createMcpServerStore', () => {
  it('returns undefined for a server that was never saved', async () => {
    const store = createMcpServerStore(createMemoryStorage());

    const result = await store.getServer('https://never-saved.example.com/mcp');

    expect(isOk(result) && result.value).toBeUndefined();
  });

  it('round-trips a saved server through storage', async () => {
    const store = createMcpServerStore(createMemoryStorage());
    const config = serverFixture();

    await store.saveServer(config);
    const result = await store.getServer(config.url);

    expect(isOk(result) && result.value).toEqual(config);
  });

  it('edits a server by saving again under the same url', async () => {
    const store = createMcpServerStore(createMemoryStorage());
    await store.saveServer(serverFixture({ name: 'Original name' }));

    await store.saveServer(serverFixture({ name: 'Renamed' }));
    const result = await store.getServer('https://mcp.example.com/mcp');

    expect(isOk(result) && result.value?.name).toBe('Renamed');
  });

  it('lists every saved server', async () => {
    const store = createMcpServerStore(createMemoryStorage());
    await store.saveServer(serverFixture({ url: 'https://a.example.com/mcp', name: 'A' }));
    await store.saveServer(serverFixture({ url: 'https://b.example.com/mcp', name: 'B' }));

    const result = await store.listServers();

    expect(isOk(result) && result.value.map((s) => s.name).sort()).toEqual(['A', 'B']);
  });

  it('removes a server', async () => {
    const store = createMcpServerStore(createMemoryStorage());
    const config = serverFixture();
    await store.saveServer(config);

    await store.removeServer(config.url);
    const result = await store.getServer(config.url);

    expect(isOk(result) && result.value).toBeUndefined();
  });

  it('removing a never-saved server is a no-op that still succeeds', async () => {
    const store = createMcpServerStore(createMemoryStorage());

    const result = await store.removeServer('https://never-saved.example.com/mcp');

    expect(isOk(result)).toBe(true);
  });

  it('persists auth header secret-name references, never a raw value', async () => {
    const store = createMcpServerStore(createMemoryStorage());
    const config = serverFixture({
      authHeaders: [{ name: 'Authorization', secretName: 'my-mcp-token' }],
    });

    await store.saveServer(config);
    const result = await store.getServer(config.url);

    expect(isOk(result) && result.value?.authHeaders).toEqual([
      { name: 'Authorization', secretName: 'my-mcp-token' },
    ]);
  });

  it("two store instances over the same storage see each other's writes", async () => {
    const storage = createMemoryStorage();
    const storeA = createMcpServerStore(storage);
    const storeB = createMcpServerStore(storage);

    await storeA.saveServer(serverFixture());
    const result = await storeB.getServer('https://mcp.example.com/mcp');

    expect(isOk(result) && result.value?.name).toBe('Example MCP server');
  });
});

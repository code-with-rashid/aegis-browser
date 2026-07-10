import { saveModelRoutingConfig, type ModelRoutingConfig } from '@aegis/llm';
import {
  createMcpServerStore,
  createMcpToolPolicyStore,
  createWebMcpSettingsStore,
  type WebMcpSource,
} from '@aegis/mcp';
import { startMockMcpServer, textResult, type MockMcpServer } from '@aegis/mcp/testing';
import { createMemoryStorage, StorageError } from '@aegis/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildLoopServices } from './build-loop-services';

const VALID_CONFIG: ModelRoutingConfig = {
  planner: { provider: { kind: 'ollama', model: 'llama3' } },
  navigator: { provider: { kind: 'ollama', model: 'llama3' } },
  verifier: { provider: { kind: 'ollama', model: 'llama3' } },
  critic: { provider: { kind: 'ollama', model: 'llama3' } },
};

let mockMcpServer: MockMcpServer | undefined;

afterEach(async () => {
  if (mockMcpServer) {
    await mockMcpServer.close();
    mockMcpServer = undefined;
  }
});

function alwaysEmptyWebMcpSource(): WebMcpSource {
  return {
    listTools: () => Promise.resolve({ ok: true, value: [] }),
    callTool: () =>
      Promise.resolve({ ok: false, error: { message: 'no webmcp tools in this fixture' } }),
    onToolsChanged: () => () => {
      // Never changes.
    },
  };
}

describe('buildLoopServices', () => {
  it('fails with MODEL_ROUTING_NOT_CONFIGURED when nothing has been saved yet', async () => {
    const result = await buildLoopServices(createMemoryStorage(), 1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('MODEL_ROUTING_NOT_CONFIGURED');
  });

  it('fails with STORAGE_FAILED when the underlying storage read errors', async () => {
    const storage = {
      get: () =>
        Promise.resolve({
          ok: false as const,
          error: new StorageError('STORAGE_READ_FAILED', 'disk error'),
        }),
      set: vi.fn(),
      remove: vi.fn(),
    };

    const result = await buildLoopServices(storage, 1);

    expect(!result.ok && result.error.code).toBe('STORAGE_FAILED');
  });

  it('builds a complete LoopServices + ExecutorContext once configured', async () => {
    const storage = createMemoryStorage();
    await saveModelRoutingConfig(storage, VALID_CONFIG);

    const result = await buildLoopServices(storage, 7);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.executorContext.session.tabId).toBe(7);
    expect(typeof result.value.attach).toBe('function');
    expect(typeof result.value.detach).toBe('function');
    expect(typeof result.value.services.perceive).toBe('function');
    expect(typeof result.value.services.plan).toBe('function');
    expect(typeof result.value.services.decide).toBe('function');
    expect(typeof result.value.services.checkPolicy).toBe('function');
    expect(typeof result.value.services.checkAlignment).toBe('function');
    expect(typeof result.value.services.act).toBe('function');
    expect(typeof result.value.services.verify).toBe('function');
  });

  it("registers an enabled, already-approved MCP server's tools into the ToolRegistry (#89)", async () => {
    const storage = createMemoryStorage();
    await saveModelRoutingConfig(storage, VALID_CONFIG);
    mockMcpServer = await startMockMcpServer([
      { name: 'get_weather', handler: () => textResult('sunny') },
    ]);
    await createMcpServerStore(storage).saveServer({
      url: mockMcpServer.url,
      name: 'weather',
      authHeaders: [],
      enabled: true,
    });
    await createMcpToolPolicyStore(storage).setPolicy({
      toolId: 'mcp.weather.get_weather',
      mode: 'allow',
    });

    const result = await buildLoopServices(storage, 1);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.toolRegistry.has('mcp.weather.get_weather')).toBe(true);
    if (result.ok) {
      await result.value.detach();
    }
  });

  it('does not connect to a disabled MCP server', async () => {
    const storage = createMemoryStorage();
    await saveModelRoutingConfig(storage, VALID_CONFIG);
    mockMcpServer = await startMockMcpServer([
      { name: 'get_weather', handler: () => textResult('sunny') },
    ]);
    await createMcpServerStore(storage).saveServer({
      url: mockMcpServer.url,
      name: 'weather',
      authHeaders: [],
      enabled: false,
    });
    await createMcpToolPolicyStore(storage).setPolicy({
      toolId: 'mcp.weather.get_weather',
      mode: 'allow',
    });

    const result = await buildLoopServices(storage, 1);

    expect(result.ok && result.value.toolRegistry.list({ source: 'mcp' })).toEqual([]);
    if (result.ok) {
      await result.value.detach();
    }
  });

  it('does not register a tool from an enabled server that has never been approved (#86 gate still applies)', async () => {
    const storage = createMemoryStorage();
    await saveModelRoutingConfig(storage, VALID_CONFIG);
    mockMcpServer = await startMockMcpServer([
      { name: 'get_weather', handler: () => textResult('sunny') },
    ]);
    await createMcpServerStore(storage).saveServer({
      url: mockMcpServer.url,
      name: 'weather',
      authHeaders: [],
      enabled: true,
    });

    const result = await buildLoopServices(storage, 1);

    expect(result.ok && result.value.toolRegistry.list({ source: 'mcp' })).toEqual([]);
    if (result.ok) {
      await result.value.detach();
    }
  });

  it('never registers WebMCP tools when the global toggle is off, even if the page declares one', async () => {
    const storage = createMemoryStorage();
    await saveModelRoutingConfig(storage, VALID_CONFIG);
    await createWebMcpSettingsStore(storage).setSettings({ enabled: false });
    const source: WebMcpSource = {
      listTools: () =>
        Promise.resolve({ ok: true, value: [{ name: 'add_to_cart', inputSchema: {} }] }),
      callTool: () => Promise.resolve({ ok: true, value: { isError: false, text: 'added' } }),
      onToolsChanged: () => () => {
        // Never changes in this fixture.
      },
    };

    const result = await buildLoopServices(storage, 1, source);

    expect(result.ok && result.value.toolRegistry.list({ source: 'webmcp' })).toEqual([]);
    if (result.ok) {
      await result.value.detach();
    }
  });

  it('still builds successfully when WebMCP is enabled but the source offers nothing', async () => {
    const storage = createMemoryStorage();
    await saveModelRoutingConfig(storage, VALID_CONFIG);

    const result = await buildLoopServices(storage, 1, alwaysEmptyWebMcpSource());

    expect(result.ok).toBe(true);
    if (result.ok) {
      await result.value.detach();
    }
  });
});

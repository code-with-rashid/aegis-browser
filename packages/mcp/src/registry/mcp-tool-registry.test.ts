import { ToolRegistry } from '@aegis/actions';
import { createMemoryStorage, err, isErr, isOk } from '@aegis/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startMockMcpServer, textResult, type MockMcpServer } from '../testing/mock-mcp-server';
import { createMcpToolPolicyStore, type McpToolPolicyStore } from '../policy/mcp-tool-policy-store';
import { inferMcpToolRisk, registerMcpServerTools } from './mcp-tool-registry';
import type { McpServerConnectionConfig } from '../config/mcp-server-config';
import type { SecretResolver } from '../config/resolve-headers';

let server: MockMcpServer | undefined;

afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
});

const noSecrets: SecretResolver = () =>
  Promise.resolve(err({ message: 'no secrets configured in this test' }));

/** A fresh policy store with `toolIds` pre-approved — simulates a tool a human already opted into, for tests exercising something other than the gate itself. */
async function preApprovedStore(toolIds: readonly string[]): Promise<McpToolPolicyStore> {
  const store = createMcpToolPolicyStore(createMemoryStorage());
  for (const toolId of toolIds) {
    await store.setPolicy({ toolId, mode: 'allow' });
  }
  return store;
}

describe('inferMcpToolRisk', () => {
  it('classifies a read-only tool as read', () => {
    expect(inferMcpToolRisk({ readOnlyHint: true })).toBe('read');
  });

  it('classifies a destructive tool as state_changing', () => {
    expect(inferMcpToolRisk({ destructiveHint: true })).toBe('state_changing');
  });

  it('classifies a tool with both hints as state_changing (destructive wins)', () => {
    expect(inferMcpToolRisk({ readOnlyHint: true, destructiveHint: true })).toBe('state_changing');
  });

  it('fails safe to state_changing when no annotations are given', () => {
    expect(inferMcpToolRisk(undefined)).toBe('state_changing');
    expect(inferMcpToolRisk({})).toBe('state_changing');
  });
});

describe('registerMcpServerTools', () => {
  it('registers each already-approved MCP tool namespaced mcp.<server>.<tool>', async () => {
    server = await startMockMcpServer([
      { name: 'get_weather', handler: () => textResult('sunny') },
      { name: 'get_forecast', handler: () => textResult('rain tomorrow') },
    ]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'Weather Co!',
      authHeaders: [],
      enabled: true,
    };
    const policyStore = await preApprovedStore([
      'mcp.weather_co.get_weather',
      'mcp.weather_co.get_forecast',
    ]);

    const result = await registerMcpServerTools(registry, config, noSecrets, policyStore);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect([...result.value.toolIds].sort()).toEqual([
        'mcp.weather_co.get_forecast',
        'mcp.weather_co.get_weather',
      ]);
      expect(result.value.newlyDiscoveredToolIds).toEqual([]);
      await result.value.disconnect();
    }
    expect(registry.has('mcp.weather_co.get_weather')).toBe(true);
    expect(registry.get('mcp.weather_co.get_weather')?.source).toBe('mcp');
  });

  it('does not register a tool seen for the first time, recording it deny (pending) and reporting it as newly discovered (#86)', async () => {
    server = await startMockMcpServer([
      { name: 'get_weather', handler: () => textResult('sunny') },
    ]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'test',
      authHeaders: [],
      enabled: true,
    };
    const policyStore = createMcpToolPolicyStore(createMemoryStorage());

    const result = await registerMcpServerTools(registry, config, noSecrets, policyStore);

    expect(isOk(result) && result.value.toolIds).toEqual([]);
    expect(isOk(result) && result.value.newlyDiscoveredToolIds).toEqual(['mcp.test.get_weather']);
    expect(registry.has('mcp.test.get_weather')).toBe(false);
    const stored = await policyStore.getPolicy('mcp.test.get_weather');
    expect(isOk(stored) && stored.value).toEqual({ toolId: 'mcp.test.get_weather', mode: 'deny' });
    if (isOk(result)) {
      await result.value.disconnect();
    }
  });

  it('does not register an explicitly denied tool, and it is not callable through the registry (#86)', async () => {
    server = await startMockMcpServer([
      { name: 'delete_account', handler: () => textResult('deleted') },
    ]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'test',
      authHeaders: [],
      enabled: true,
    };
    const policyStore = createMcpToolPolicyStore(createMemoryStorage());
    await policyStore.setPolicy({ toolId: 'mcp.test.delete_account', mode: 'deny' });

    const result = await registerMcpServerTools(registry, config, noSecrets, policyStore);

    expect(isOk(result) && result.value.toolIds).toEqual([]);
    expect(isOk(result) && result.value.newlyDiscoveredToolIds).toEqual([]);
    expect(registry.has('mcp.test.delete_account')).toBe(false);
    const callResult = await registry.call(
      'mcp.test.delete_account',
      {},
      { session: undefined as never, tabManager: undefined as never },
    );
    expect(isErr(callResult) && callResult.error.code).toBe('TOOL_UNKNOWN');
    if (isOk(result)) {
      await result.value.disconnect();
    }
  });

  it('gates a mixed batch independently: registers only the explicitly allowed tool', async () => {
    server = await startMockMcpServer([
      { name: 'get_weather', handler: () => textResult('sunny') },
      { name: 'delete_account', handler: () => textResult('deleted') },
      { name: 'brand_new_tool', handler: () => textResult('ok') },
    ]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'test',
      authHeaders: [],
      enabled: true,
    };
    const policyStore = createMcpToolPolicyStore(createMemoryStorage());
    await policyStore.setPolicy({ toolId: 'mcp.test.get_weather', mode: 'allow' });
    await policyStore.setPolicy({ toolId: 'mcp.test.delete_account', mode: 'deny' });

    const result = await registerMcpServerTools(registry, config, noSecrets, policyStore);

    expect(isOk(result) && result.value.toolIds).toEqual(['mcp.test.get_weather']);
    expect(isOk(result) && result.value.newlyDiscoveredToolIds).toEqual([
      'mcp.test.brand_new_tool',
    ]);
    if (isOk(result)) {
      await result.value.disconnect();
    }
  });

  it('never connects when the server config is disabled (per-server allow/deny, #86)', async () => {
    server = await startMockMcpServer([{ name: 'noop', handler: () => textResult('ok') }]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'test',
      authHeaders: [],
      enabled: false,
    };
    const policyStore = createMcpToolPolicyStore(createMemoryStorage());

    const result = await registerMcpServerTools(registry, config, noSecrets, policyStore);

    expect(isOk(result) && result.value.toolIds).toEqual([]);
    expect(isOk(result) && result.value.newlyDiscoveredToolIds).toEqual([]);
    // Proves no connection was ever attempted, not just that no tools were registered.
    expect(server.requestHeaders).toHaveLength(0);
    expect(registry.list()).toHaveLength(0);
  });

  it('assigns risk from MCP annotations, failing safe when none are declared', async () => {
    server = await startMockMcpServer([
      { name: 'read_tool', annotations: { readOnlyHint: true }, handler: () => textResult('ok') },
      {
        name: 'destructive_tool',
        annotations: { destructiveHint: true },
        handler: () => textResult('ok'),
      },
      { name: 'unannotated_tool', handler: () => textResult('ok') },
    ]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'test',
      authHeaders: [],
      enabled: true,
    };
    const policyStore = await preApprovedStore([
      'mcp.test.read_tool',
      'mcp.test.destructive_tool',
      'mcp.test.unannotated_tool',
    ]);

    const result = await registerMcpServerTools(registry, config, noSecrets, policyStore);
    expect(isOk(result)).toBe(true);

    expect(registry.get('mcp.test.read_tool')?.risk).toBe('read');
    expect(registry.get('mcp.test.destructive_tool')?.risk).toBe('state_changing');
    expect(registry.get('mcp.test.unannotated_tool')?.risk).toBe('state_changing');
    if (isOk(result)) {
      await result.value.disconnect();
    }
  });

  it("executes a registered tool through the registry, using the tool's own real inputSchema", async () => {
    server = await startMockMcpServer([
      {
        name: 'get_weather',
        inputSchema: { city: z.string() },
        handler: (args) => textResult(`sunny in ${String(args['city'])}`),
      },
    ]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'test',
      authHeaders: [],
      enabled: true,
    };
    const policyStore = await preApprovedStore(['mcp.test.get_weather']);
    const registerResult = await registerMcpServerTools(registry, config, noSecrets, policyStore);
    expect(isOk(registerResult)).toBe(true);

    const callResult = await registry.call(
      'mcp.test.get_weather',
      { city: 'London' },
      { session: undefined as never, tabManager: undefined as never },
    );

    expect(isOk(callResult) && callResult.value).toBe('sunny in London');
    if (isOk(registerResult)) {
      await registerResult.value.disconnect();
    }
  });

  it('rejects schema-invalid args before ever reaching the MCP server', async () => {
    server = await startMockMcpServer([
      { name: 'get_weather', inputSchema: { city: z.string() }, handler: () => textResult('ok') },
    ]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'test',
      authHeaders: [],
      enabled: true,
    };
    const policyStore = await preApprovedStore(['mcp.test.get_weather']);
    const registerResult = await registerMcpServerTools(registry, config, noSecrets, policyStore);
    expect(isOk(registerResult)).toBe(true);

    const callResult = await registry.call(
      'mcp.test.get_weather',
      { city: 42 },
      { session: undefined as never, tabManager: undefined as never },
    );

    expect(isErr(callResult) && callResult.error.code).toBe('TOOL_INVALID_ARGS');
    if (isOk(registerResult)) {
      await registerResult.value.disconnect();
    }
  });

  it('surfaces a tool-level failure (isError) as a ToolExecutionError', async () => {
    server = await startMockMcpServer([
      { name: 'broken', handler: () => textResult('it broke', true) },
    ]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'test',
      authHeaders: [],
      enabled: true,
    };
    const policyStore = await preApprovedStore(['mcp.test.broken']);
    const registerResult = await registerMcpServerTools(registry, config, noSecrets, policyStore);
    expect(isOk(registerResult)).toBe(true);

    const callResult = await registry.call(
      'mcp.test.broken',
      {},
      { session: undefined as never, tabManager: undefined as never },
    );

    expect(isErr(callResult) && callResult.error.code).toBe('TOOL_EXECUTION_FAILED');
    expect(isErr(callResult) && callResult.error.message).toBe('it broke');
    if (isOk(registerResult)) {
      await registerResult.value.disconnect();
    }
  });

  it('fails without registering anything when a referenced secret is missing', async () => {
    server = await startMockMcpServer([{ name: 'noop', handler: () => textResult('ok') }]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'test',
      authHeaders: [{ name: 'Authorization', secretName: 'missing' }],
      enabled: true,
    };
    const policyStore = createMcpToolPolicyStore(createMemoryStorage());

    const result = await registerMcpServerTools(registry, config, noSecrets, policyStore);

    expect(isErr(result)).toBe(true);
    expect(registry.list()).toHaveLength(0);
  });

  it('fails with a McpClientError when the server is unreachable', async () => {
    server = await startMockMcpServer([]);
    const { url } = server;
    await server.close();
    server = undefined;
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = { url, name: 'test', authHeaders: [], enabled: true };
    const policyStore = createMcpToolPolicyStore(createMemoryStorage());

    const result = await registerMcpServerTools(registry, config, noSecrets, policyStore);

    expect(isErr(result) && 'code' in result.error && result.error.code).toBe(
      'MCP_CONNECTION_FAILED',
    );
  });

  it('completes an elicitation round-trip through the injected handler', async () => {
    // The handler closes over `mockServer`, assigned only once `startMockMcpServer`
    // resolves — the handler itself never runs before then, only once a tool call
    // arrives over the (by-then-established) connection.
    let mockServer: MockMcpServer;
    server = mockServer = await startMockMcpServer([
      {
        name: 'needs_confirmation',
        handler: async () => {
          const elicited = await mockServer.server.server.elicitInput({
            message: 'Really do this?',
            requestedSchema: { type: 'object', properties: { confirmed: { type: 'boolean' } } },
          });
          return textResult(elicited.action === 'accept' ? 'confirmed' : 'not confirmed');
        },
      },
    ]);
    const registry = new ToolRegistry();
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'test',
      authHeaders: [],
      enabled: true,
    };
    const policyStore = await preApprovedStore(['mcp.test.needs_confirmation']);
    let receivedMessage = '';

    const registerResult = await registerMcpServerTools(registry, config, noSecrets, policyStore, {
      onElicitationRequest: (request) => {
        receivedMessage = request.message;
        return Promise.resolve({ action: 'accept', content: { confirmed: true } });
      },
    });
    expect(isOk(registerResult)).toBe(true);
    if (!isOk(registerResult)) {
      return;
    }

    const callResult = await registry.call(
      'mcp.test.needs_confirmation',
      {},
      { session: undefined as never, tabManager: undefined as never },
    );

    expect(isOk(callResult) && callResult.value).toBe('confirmed');
    expect(receivedMessage).toBe('Really do this?');
    await registerResult.value.disconnect();
  });
});

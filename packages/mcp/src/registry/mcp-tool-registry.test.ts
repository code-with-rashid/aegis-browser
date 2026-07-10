import { ToolRegistry } from '@aegis/actions';
import { err, isErr, isOk } from '@aegis/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startMockMcpServer, textResult, type MockMcpServer } from '../testing/mock-mcp-server';
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
  it('registers each MCP tool namespaced mcp.<server>.<tool>', async () => {
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

    const result = await registerMcpServerTools(registry, config, noSecrets);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect([...result.value.toolIds].sort()).toEqual([
        'mcp.weather_co.get_forecast',
        'mcp.weather_co.get_weather',
      ]);
      await result.value.disconnect();
    }
    expect(registry.has('mcp.weather_co.get_weather')).toBe(true);
    expect(registry.get('mcp.weather_co.get_weather')?.source).toBe('mcp');
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

    const result = await registerMcpServerTools(registry, config, noSecrets);
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
    const registerResult = await registerMcpServerTools(registry, config, noSecrets);
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
    const registerResult = await registerMcpServerTools(registry, config, noSecrets);
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
    const registerResult = await registerMcpServerTools(registry, config, noSecrets);
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

    const result = await registerMcpServerTools(registry, config, noSecrets);

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

    const result = await registerMcpServerTools(registry, config, noSecrets);

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
    let receivedMessage = '';

    const registerResult = await registerMcpServerTools(registry, config, noSecrets, {
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

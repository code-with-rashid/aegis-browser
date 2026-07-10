import { err, isErr, isOk, ok } from '@aegis/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startMockMcpServer, textResult, type MockMcpServer } from '../testing/mock-mcp-server';
import { testMcpServerConnection } from './test-connection';
import type { McpServerConnectionConfig } from './mcp-server-config';
import type { SecretResolver } from './resolve-headers';

let server: MockMcpServer | undefined;

afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
});

const noSecrets: SecretResolver = () =>
  Promise.resolve(err({ message: 'no secrets configured in this test' }));

describe('testMcpServerConnection', () => {
  it('connects and lists tools for a server with no auth headers configured', async () => {
    server = await startMockMcpServer([
      {
        name: 'get_weather',
        description: 'Look up the weather.',
        inputSchema: { city: z.string() },
        handler: () => textResult('sunny'),
      },
    ]);
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'Test server',
      authHeaders: [],
      enabled: true,
    };

    const result = await testMcpServerConnection(config, noSecrets);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((tool) => tool.name)).toEqual(['get_weather']);
    }
  });

  it('resolves and sends configured auth headers', async () => {
    server = await startMockMcpServer([{ name: 'noop', handler: () => textResult('ok') }]);
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'Test server',
      authHeaders: [{ name: 'Authorization', secretName: 'my-token' }],
      enabled: true,
    };
    const resolveSecret: SecretResolver = (name) =>
      Promise.resolve(
        name === 'my-token' ? ok('Bearer secret-value') : err({ message: 'unknown' }),
      );

    const result = await testMcpServerConnection(config, resolveSecret);

    expect(isOk(result)).toBe(true);
    expect(
      server.requestHeaders.some((headers) => headers['authorization'] === 'Bearer secret-value'),
    ).toBe(true);
  });

  it('fails without ever connecting when a referenced secret is missing', async () => {
    server = await startMockMcpServer([{ name: 'noop', handler: () => textResult('ok') }]);
    const config: McpServerConnectionConfig = {
      url: server.url,
      name: 'Test server',
      authHeaders: [{ name: 'Authorization', secretName: 'missing-secret' }],
      enabled: true,
    };

    const result = await testMcpServerConnection(config, noSecrets);

    expect(isErr(result)).toBe(true);
    expect(server.requestHeaders).toHaveLength(0);
  });

  it('fails with a McpClientError when the server is unreachable', async () => {
    server = await startMockMcpServer([]);
    const { url } = server;
    await server.close();
    server = undefined;
    const config: McpServerConnectionConfig = {
      url,
      name: 'Test server',
      authHeaders: [],
      enabled: true,
    };

    const result = await testMcpServerConnection(config, noSecrets);

    expect(isErr(result) && 'code' in result.error && result.error.code).toBe(
      'MCP_CONNECTION_FAILED',
    );
  });

  it('never leaks a resolved secret value into a returned error', async () => {
    server = await startMockMcpServer([]);
    const { url } = server;
    await server.close();
    server = undefined;
    const secretValue = 'sk-super-secret-token';
    const config: McpServerConnectionConfig = {
      url,
      name: 'Test server',
      authHeaders: [{ name: 'Authorization', secretName: 'my-token' }],
      enabled: true,
    };
    const resolveSecret: SecretResolver = () => Promise.resolve(ok(`Bearer ${secretValue}`));

    const result = await testMcpServerConnection(config, resolveSecret);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(JSON.stringify(result.error)).not.toContain(secretValue);
    }
  });
});

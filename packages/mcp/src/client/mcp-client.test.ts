import * as http from 'node:http';

import { isErr, isOk } from '@aegis/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startMockMcpServer, textResult, type MockMcpServer } from '../testing/mock-mcp-server';
import { createMcpClient } from './mcp-client';

let server: MockMcpServer | undefined;

afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
});

describe('createMcpClient', () => {
  it('connects and lists tools declared by a real MCP server', async () => {
    server = await startMockMcpServer([
      {
        name: 'get_weather',
        description: 'Look up the weather for a city.',
        inputSchema: { city: z.string() },
        handler: () => textResult('sunny'),
      },
    ]);
    const client = createMcpClient({ url: server.url });

    const connectResult = await client.connect();
    expect(isOk(connectResult)).toBe(true);

    const toolsResult = await client.listTools();
    expect(isOk(toolsResult)).toBe(true);
    if (isOk(toolsResult)) {
      expect(toolsResult.value).toHaveLength(1);
      expect(toolsResult.value[0]?.name).toBe('get_weather');
      expect(toolsResult.value[0]?.description).toBe('Look up the weather for a city.');
      expect(toolsResult.value[0]?.inputSchema).toMatchObject({ type: 'object' });
    }

    await client.disconnect();
  });

  it('calls a tool and surfaces its text result', async () => {
    server = await startMockMcpServer([
      {
        name: 'get_weather',
        inputSchema: { city: z.string() },
        handler: (args) => textResult(`weather for ${String(args['city'])}: sunny`),
      },
    ]);
    const client = createMcpClient({ url: server.url });
    await client.connect();

    const result = await client.callTool('get_weather', { city: 'London' });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.isError).toBe(false);
      expect(result.value.content).toEqual([{ type: 'text', text: 'weather for London: sunny' }]);
    }
  });

  it('surfaces a tool-level failure as isError, not a McpClientError', async () => {
    server = await startMockMcpServer([
      { name: 'broken', handler: () => textResult('it broke', true) },
    ]);
    const client = createMcpClient({ url: server.url });
    await client.connect();

    const result = await client.callTool('broken', {});

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.isError).toBe(true);
      expect(result.value.content).toEqual([{ type: 'text', text: 'it broke' }]);
    }
  });

  it('sends configured auth headers with every request', async () => {
    server = await startMockMcpServer([{ name: 'noop', handler: () => textResult('ok') }]);
    const secretToken = 'sk-super-secret-token-12345';
    const client = createMcpClient({
      url: server.url,
      headers: { Authorization: `Bearer ${secretToken}` },
    });

    await client.connect();
    await client.listTools();

    expect(server.requestHeaders.length).toBeGreaterThan(0);
    expect(
      server.requestHeaders.some((headers) => headers['authorization'] === `Bearer ${secretToken}`),
    ).toBe(true);
  });

  it('never includes a configured auth header in a typed error, even on failure', async () => {
    server = await startMockMcpServer([{ name: 'noop', handler: () => textResult('ok') }]);
    const secretToken = 'sk-super-secret-token-12345';
    const { url } = server;
    await server.close();
    server = undefined;
    const client = createMcpClient({ url, headers: { Authorization: `Bearer ${secretToken}` } });

    const result = await client.connect();

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(JSON.stringify(result.error)).not.toContain(secretToken);
      expect(result.error.message).not.toContain(secretToken);
    }
  });

  it('an unknown tool call surfaces as isError, not a McpClientError (per MCP convention)', async () => {
    server = await startMockMcpServer([{ name: 'known', handler: () => textResult('ok') }]);
    const client = createMcpClient({ url: server.url });
    await client.connect();

    const result = await client.callTool('does-not-exist', {});

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.isError).toBe(true);
    }
  });

  it('fails with MCP_PROTOCOL_ERROR when the server response fails MCP schema validation', async () => {
    const nonMcpServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ hello: 'not an MCP server' }));
    });
    await new Promise<void>((resolve) => nonMcpServer.listen(0, '127.0.0.1', resolve));
    const address = nonMcpServer.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    try {
      const client = createMcpClient({ url: `http://127.0.0.1:${port}/mcp` }, { timeoutMs: 2000 });

      const result = await client.connect();

      expect(isErr(result) && result.error.code).toBe('MCP_PROTOCOL_ERROR');
    } finally {
      nonMcpServer.close();
    }
  });

  it('fails with MCP_NOT_CONNECTED when listTools is called before connect', async () => {
    const client = createMcpClient({ url: 'http://127.0.0.1:1/mcp' });

    const result = await client.listTools();

    expect(isErr(result) && result.error.code).toBe('MCP_NOT_CONNECTED');
  });

  it('fails with MCP_NOT_CONNECTED when callTool is called before connect', async () => {
    const client = createMcpClient({ url: 'http://127.0.0.1:1/mcp' });

    const result = await client.callTool('anything', {});

    expect(isErr(result) && result.error.code).toBe('MCP_NOT_CONNECTED');
  });

  it('fails with MCP_CONNECTION_FAILED when the server is unreachable', async () => {
    server = await startMockMcpServer([]);
    const { url } = server;
    await server.close();
    server = undefined;

    const client = createMcpClient({ url });
    const result = await client.connect();

    expect(isErr(result) && result.error.code).toBe('MCP_CONNECTION_FAILED');
  });

  it('fails with MCP_TIMEOUT when a tool call exceeds the configured timeout', async () => {
    server = await startMockMcpServer([
      {
        name: 'slow',
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return textResult('eventually');
        },
      },
    ]);
    // A wide margin above the connect handshake's own latency (a loopback round-trip,
    // normally single-digit ms, but can spike under CI load) and well below the tool
    // handler's artificial delay — a tight timeout here previously made connect() itself
    // time out under load, failing with a confusing MCP_NOT_CONNECTED instead.
    const client = createMcpClient({ url: server.url }, { timeoutMs: 300 });
    const connectResult = await client.connect();
    expect(isOk(connectResult)).toBe(true);

    const result = await client.callTool('slow', {});

    expect(isErr(result) && result.error.code).toBe('MCP_TIMEOUT');
  });

  it('fails with MCP_CANCELLED when the caller aborts the signal', async () => {
    server = await startMockMcpServer([
      {
        name: 'slow',
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return textResult('eventually');
        },
      },
    ]);
    const client = createMcpClient({ url: server.url });
    await client.connect();
    const controller = new AbortController();

    const pending = client.callTool('slow', {}, controller.signal);
    controller.abort();
    const result = await pending;

    expect(isErr(result) && result.error.code).toBe('MCP_CANCELLED');
  });

  it('disconnect() is safe to call even when never connected', async () => {
    const client = createMcpClient({ url: 'http://127.0.0.1:1/mcp' });
    await expect(client.disconnect()).resolves.toBeUndefined();
  });
});

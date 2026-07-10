import { randomUUID } from 'node:crypto';
import * as http from 'node:http';

import { McpServer, type ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** One tool a {@link MockMcpServer} exposes to a real, connecting `McpClient`. */
export interface MockMcpToolSpec {
  readonly name: string;
  readonly description?: string;
  /** A Zod raw shape (e.g. `{ city: z.string() }`) — omit for a zero-argument tool. */
  readonly inputSchema?: ZodRawShapeCompat;
  /** Standard MCP tool hints (`readOnlyHint`/`destructiveHint`) — for testing risk inference (#85). */
  readonly annotations?: { readonly readOnlyHint?: boolean; readonly destructiveHint?: boolean };
  handler(args: Record<string, unknown>): CallToolResult | Promise<CallToolResult>;
}

/**
 * A real MCP server bound to `127.0.0.1` on an ephemeral port, speaking Streamable HTTP —
 * this is a genuine local HTTP round-trip (matching this codebase's fake-model-server
 * convention, `docs/adr/0019-e2e-read-only-use-cases.md`), not an in-process stub, so it
 * exercises `McpClient`'s real transport code, not just its call-shape plumbing.
 */
export interface MockMcpServer {
  readonly url: string;
  /** Every request's headers, oldest first — lets a test assert an auth header was actually sent, and exactly what it contained. */
  readonly requestHeaders: readonly Readonly<Record<string, string | string[] | undefined>>[];
  /** The underlying server instance — for advanced tests that need to register a tool after startup (e.g. one that triggers elicitation via `server.server.elicitInput(...)`). */
  readonly server: McpServer;
  close(): Promise<void>;
}

const MOCK_SERVER_PATH = '/mcp';

/**
 * Starts a {@link MockMcpServer} exposing `tools`. Runs in stateful mode (a real session
 * id per connection) — the SDK's stateless mode (`sessionIdGenerator: undefined`) doesn't
 * correctly complete the MCP handshake over this SDK version's Node HTTP bridge, and a
 * real MCP server commonly runs stateful anyway, so this is the more representative
 * choice for a test double.
 */
export async function startMockMcpServer(
  tools: readonly MockMcpToolSpec[] = [],
): Promise<MockMcpServer> {
  const mcpServer = new McpServer({ name: 'aegis-mock-mcp-server', version: '1.0.0' });
  for (const tool of tools) {
    const inputSchema = tool.inputSchema ?? {};
    const config: {
      description?: string;
      inputSchema: ZodRawShapeCompat;
      annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
    } = {
      ...(tool.description !== undefined ? { description: tool.description } : {}),
      inputSchema,
      ...(tool.annotations !== undefined ? { annotations: tool.annotations } : {}),
    };
    const callback: ToolCallback<ZodRawShapeCompat> = (args) => tool.handler(args);
    mcpServer.registerTool(tool.name, config, callback);
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  await mcpServer.connect(transport as Transport);

  const requestHeaders: Record<string, string | string[] | undefined>[] = [];
  const httpServer = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.url !== MOCK_SERVER_PATH) {
      res.writeHead(404).end();
      return;
    }
    requestHeaders.push({ ...req.headers });
    void transport.handleRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  const address = httpServer.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}${MOCK_SERVER_PATH}`,
    requestHeaders,
    server: mcpServer,
    async close() {
      await transport.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((closeError: Error | undefined) => {
          if (closeError) {
            reject(closeError);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

/** A trivial `CallToolResult` — `text`-only, matching what {@link McpClient} surfaces. */
export function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text }], isError };
}

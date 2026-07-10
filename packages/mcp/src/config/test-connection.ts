import { isErr, type Result } from '@aegis/shared';

import {
  createMcpClient,
  type CreateMcpClientOptions,
  type McpToolDescriptor,
} from '../client/mcp-client';
import type { McpClientError } from '../client/errors';
import {
  resolveAuthHeaders,
  type SecretResolver,
  type SecretResolveError,
} from './resolve-headers';
import type { McpServerConnectionConfig } from './mcp-server-config';

export type McpConnectionTestError = SecretResolveError | McpClientError;

/**
 * Tests a configured MCP server end to end: resolves its auth headers from the vault
 * (via `resolveSecret`), connects, and lists its tools — the same three steps a real
 * `ToolRegistry` wiring (#85) will perform, so a passing test genuinely predicts the
 * server will work once enabled. Always disconnects before returning, whether the test
 * succeeded or failed after connecting.
 */
export async function testMcpServerConnection(
  config: McpServerConnectionConfig,
  resolveSecret: SecretResolver,
  options: CreateMcpClientOptions = {},
): Promise<Result<readonly McpToolDescriptor[], McpConnectionTestError>> {
  const headersResult = await resolveAuthHeaders(config.authHeaders, resolveSecret);
  if (isErr(headersResult)) {
    return headersResult;
  }

  const client = createMcpClient(
    {
      url: config.url,
      ...(Object.keys(headersResult.value).length > 0 ? { headers: headersResult.value } : {}),
    },
    options,
  );

  const connectResult = await client.connect();
  if (isErr(connectResult)) {
    return connectResult;
  }

  try {
    return await client.listTools();
  } finally {
    await client.disconnect();
  }
}

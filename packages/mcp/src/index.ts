export type {
  McpServerConfig,
  McpToolDescriptor,
  McpTextContent,
  McpToolCallResult,
  CreateMcpClientOptions,
  McpClient,
} from './client/mcp-client';
export { createMcpClient } from './client/mcp-client';

export type { McpClientErrorCode } from './client/errors';
export { McpClientError } from './client/errors';

export type { MockMcpToolSpec, MockMcpServer } from './testing/mock-mcp-server';
export { startMockMcpServer, textResult } from './testing/mock-mcp-server';

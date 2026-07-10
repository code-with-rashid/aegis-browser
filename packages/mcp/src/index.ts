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

export type {
  McpAuthHeaderConfig,
  McpServerConnectionConfig,
  McpServerConnectionConfigMap,
} from './config/mcp-server-config';
export {
  McpAuthHeaderConfigSchema,
  McpServerConnectionConfigSchema,
  McpServerConnectionConfigMapSchema,
} from './config/mcp-server-config';

export type { McpServerStore } from './config/mcp-server-store';
export { createMcpServerStore } from './config/mcp-server-store';

export type { SecretResolver, SecretResolveError } from './config/resolve-headers';
export { resolveAuthHeaders } from './config/resolve-headers';

export type { McpConnectionTestError } from './config/test-connection';
export { testMcpServerConnection } from './config/test-connection';

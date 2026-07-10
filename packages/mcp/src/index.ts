export type {
  McpServerConfig,
  McpToolAnnotations,
  McpToolDescriptor,
  McpTextContent,
  McpToolCallResult,
  ElicitationRequest,
  ElicitationResponse,
  ElicitationHandler,
  CreateMcpClientOptions,
  McpClient,
} from './client/mcp-client';
export { createMcpClient } from './client/mcp-client';

export type { McpClientErrorCode } from './client/errors';
export { McpClientError } from './client/errors';

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

export { jsonSchemaToZod } from './registry/json-schema-to-zod';

export { toIdSegment, buildMcpToolId } from './registry/tool-id';

export type {
  McpToolRegistrationError,
  RegisteredMcpServerTools,
} from './registry/mcp-tool-registry';
export { inferMcpToolRisk, registerMcpServerTools } from './registry/mcp-tool-registry';

export type { McpToolPolicyMode, McpToolPolicy, McpToolPolicyMap } from './policy/mcp-tool-policy';
export { McpToolPolicyModeSchema, McpToolPolicySchema } from './policy/mcp-tool-policy';

export type { McpToolPolicyStore } from './policy/mcp-tool-policy-store';
export { createMcpToolPolicyStore } from './policy/mcp-tool-policy-store';

export type { McpToolGateResult } from './policy/gate-mcp-tools';
export { gateMcpTools } from './policy/gate-mcp-tools';

export type { WebMcpToolAnnotations, WebMcpToolDescriptor } from './webmcp/webmcp-tool';

export type { WebMcpSourceError, WebMcpToolCallResult, WebMcpSource } from './webmcp/webmcp-source';

export { inferWebMcpToolRisk } from './webmcp/infer-webmcp-tool-risk';

export type { RegisteredWebMcpTools } from './webmcp/register-webmcp-tools';
export { registerWebMcpTools } from './webmcp/register-webmcp-tools';

export type {
  WebMcpToolsEventDetail,
  WebMcpRequestSyncEventDetail,
  WebMcpCallEventDetail,
  WebMcpResultEventDetail,
} from './webmcp/bridge-protocol';
export {
  WEBMCP_TOOLS_EVENT,
  WEBMCP_REQUEST_SYNC_EVENT,
  WEBMCP_CALL_EVENT,
  WEBMCP_RESULT_EVENT,
} from './webmcp/bridge-protocol';

export type { WebMcpCapableTarget } from './webmcp/page-bridge';
export { installWebMcpPageBridge } from './webmcp/page-bridge';

export type {
  CreateWebMcpEventBridgeSourceOptions,
  WebMcpEventBridgeSource,
} from './webmcp/isolated-bridge';
export { createWebMcpEventBridgeSource } from './webmcp/isolated-bridge';

export type { WebMcpSettings, WebMcpSettingsStore } from './webmcp/webmcp-settings';
export { createWebMcpSettingsStore } from './webmcp/webmcp-settings';

import { ToolExecutionError, type Tool, type ToolRegistry, type ToolRisk } from '@aegis/actions';
import { err, isErr, ok, type Result, type StorageError } from '@aegis/shared';

import type { McpClientError } from '../client/errors';
import {
  createMcpClient,
  type CreateMcpClientOptions,
  type McpClient,
  type McpToolAnnotations,
  type McpToolDescriptor,
} from '../client/mcp-client';
import type { McpServerConnectionConfig } from '../config/mcp-server-config';
import {
  resolveAuthHeaders,
  type SecretResolveError,
  type SecretResolver,
} from '../config/resolve-headers';
import { gateMcpTools } from '../policy/gate-mcp-tools';
import type { McpToolPolicyStore } from '../policy/mcp-tool-policy-store';
import { jsonSchemaToZod } from './json-schema-to-zod';
import { buildMcpToolId, toIdSegment } from './tool-id';

export type McpToolRegistrationError = SecretResolveError | McpClientError | StorageError;

/**
 * Infers a Tool's static risk from its MCP annotations: `readOnlyHint: true` (and not
 * also `destructiveHint`) is `read`; anything else — including a server that declares no
 * annotations at all — fails safe to `state_changing`, the same "unknown risk denies by
 * default" convention `@aegis/actions`' `ToolRegistry.classify` already applies to an
 * unrecognized tool id.
 */
export function inferMcpToolRisk(annotations?: McpToolAnnotations): ToolRisk {
  if (annotations?.destructiveHint === true) {
    return 'state_changing';
  }
  if (annotations?.readOnlyHint === true) {
    return 'read';
  }
  return 'state_changing';
}

function buildMcpTool(
  serverIdSegment: string,
  client: McpClient,
  descriptor: McpToolDescriptor,
): Tool {
  return {
    id: buildMcpToolId(serverIdSegment, descriptor.name),
    source: 'mcp',
    description: descriptor.description ?? '',
    inputSchema: jsonSchemaToZod(descriptor.inputSchema),
    risk: inferMcpToolRisk(descriptor.annotations),
    async execute(args) {
      const result = await client.callTool(descriptor.name, args);
      if (isErr(result)) {
        return err(
          new ToolExecutionError('TOOL_EXECUTION_FAILED', result.error.message, {
            cause: result.error,
          }),
        );
      }
      const text = result.value.content.map((block) => block.text).join('\n');
      if (result.value.isError) {
        return err(
          new ToolExecutionError(
            'TOOL_EXECUTION_FAILED',
            text.length > 0 ? text : `Tool "${descriptor.name}" reported an error`,
          ),
        );
      }
      return ok(text);
    },
  };
}

export interface RegisteredMcpServerTools {
  readonly toolIds: readonly string[];
  /** Tool ids discovered for the first time this call — recorded deny (pending) in `policyStore`, and excluded from `toolIds`; surface these so a management UI (#89) can prompt for a decision. */
  readonly newlyDiscoveredToolIds: readonly string[];
  /** Closes the underlying MCP connection every registered tool's `execute` reuses. Call when the server is disabled/removed, or the extension tears down. */
  disconnect(): Promise<void>;
}

const NOOP_REGISTRATION: RegisteredMcpServerTools = {
  toolIds: [],
  newlyDiscoveredToolIds: [],
  disconnect: () => Promise.resolve(),
};

/**
 * Connects to `config`, lists its tools, and registers each *allowed* tool (per
 * `policyStore` — #86's deny-by-default admission gate, `gate-mcp-tools.ts`) as a
 * `source: "mcp"` Tool (`mcp.<server>.<tool>`) into `registry` — the bridge between
 * `@aegis/mcp` and the `ToolRegistry` the Navigator already consumes (#81). A `config`
 * with `enabled: false` is never even connected to (the per-server allow/deny gate) and
 * resolves to an empty, no-op registration. The returned connection stays open for the
 * registered tools' lifetime — each `Tool.execute` reuses it rather than reconnecting per
 * call; call `disconnect()` when the server is disabled/removed or the extension tears
 * down.
 */
export async function registerMcpServerTools(
  registry: ToolRegistry,
  config: McpServerConnectionConfig,
  resolveSecret: SecretResolver,
  policyStore: McpToolPolicyStore,
  options: CreateMcpClientOptions = {},
): Promise<Result<RegisteredMcpServerTools, McpToolRegistrationError>> {
  if (!config.enabled) {
    return ok(NOOP_REGISTRATION);
  }

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

  const toolsResult = await client.listTools();
  if (isErr(toolsResult)) {
    await client.disconnect();
    return toolsResult;
  }

  const serverIdSegment = toIdSegment(config.name);
  const gateResult = await gateMcpTools(serverIdSegment, toolsResult.value, policyStore);
  if (isErr(gateResult)) {
    await client.disconnect();
    return gateResult;
  }

  const toolIds: string[] = [];
  for (const descriptor of gateResult.value.allowed) {
    const tool = buildMcpTool(serverIdSegment, client, descriptor);
    registry.register(tool);
    toolIds.push(tool.id);
  }

  return ok({
    toolIds,
    newlyDiscoveredToolIds: gateResult.value.newlyDiscoveredToolIds,
    disconnect: () => client.disconnect(),
  });
}

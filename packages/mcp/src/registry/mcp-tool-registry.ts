import { ToolExecutionError, type Tool, type ToolRegistry, type ToolRisk } from '@aegis/actions';
import { err, isErr, ok, type Result } from '@aegis/shared';

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
import { jsonSchemaToZod } from './json-schema-to-zod';

export type McpToolRegistrationError = SecretResolveError | McpClientError;

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

/** Namespaces a server's display name into an id-safe segment, e.g. `"My Server!"` → `"my_server"`. */
function toIdSegment(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'server';
}

function buildMcpTool(
  serverIdSegment: string,
  client: McpClient,
  descriptor: McpToolDescriptor,
): Tool {
  return {
    id: `mcp.${serverIdSegment}.${descriptor.name}`,
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
  /** Closes the underlying MCP connection every registered tool's `execute` reuses. Call when the server is disabled/removed, or the extension tears down. */
  disconnect(): Promise<void>;
}

/**
 * Connects to `config` (an enabled MCP server), lists its tools, and registers each as a
 * `source: "mcp"` Tool (`mcp.<server>.<tool>`) into `registry` — the bridge between
 * `@aegis/mcp` and the `ToolRegistry` the Navigator already consumes (#81). The returned
 * connection stays open for the registered tools' lifetime — each `Tool.execute` reuses
 * it rather than reconnecting per call; call `disconnect()` when the server is
 * disabled/removed or the extension tears down.
 */
export async function registerMcpServerTools(
  registry: ToolRegistry,
  config: McpServerConnectionConfig,
  resolveSecret: SecretResolver,
  options: CreateMcpClientOptions = {},
): Promise<Result<RegisteredMcpServerTools, McpToolRegistrationError>> {
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
  const toolIds: string[] = [];
  for (const descriptor of toolsResult.value) {
    const tool = buildMcpTool(serverIdSegment, client, descriptor);
    registry.register(tool);
    toolIds.push(tool.id);
  }

  return ok({
    toolIds,
    disconnect: () => client.disconnect(),
  });
}

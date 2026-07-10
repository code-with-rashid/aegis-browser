import { ToolExecutionError, type Tool, type ToolRegistry } from '@aegis/actions';
import { err, isErr, ok, type Result } from '@aegis/shared';

import { jsonSchemaToZod } from '../registry/json-schema-to-zod';
import { inferWebMcpToolRisk } from './infer-webmcp-tool-risk';
import type { WebMcpSource, WebMcpSourceError } from './webmcp-source';
import type { WebMcpToolDescriptor } from './webmcp-tool';

/** `web.<tool>` — flat, unlike MCP's `mcp.<server>.<tool>`: a WebMCP tool always belongs to whichever single page is currently active, so there's no second server segment to namespace against (`docs/adr/0035-webmcp-detection-and-adapter.md`). */
function buildWebMcpToolId(name: string): string {
  return `web.${name}`;
}

function buildWebMcpTool(source: WebMcpSource, descriptor: WebMcpToolDescriptor): Tool {
  return {
    id: buildWebMcpToolId(descriptor.name),
    source: 'webmcp',
    description: descriptor.description ?? '',
    inputSchema: jsonSchemaToZod(descriptor.inputSchema),
    risk: inferWebMcpToolRisk(descriptor.annotations),
    async execute(args) {
      const result = await source.callTool(descriptor.name, args);
      if (isErr(result)) {
        return err(
          new ToolExecutionError('TOOL_EXECUTION_FAILED', result.error.message, {
            cause: result.error,
          }),
        );
      }
      if (result.value.isError) {
        return err(
          new ToolExecutionError(
            'TOOL_EXECUTION_FAILED',
            result.value.text.length > 0
              ? result.value.text
              : `Tool "${descriptor.name}" reported an error`,
          ),
        );
      }
      return ok(result.value.text);
    },
  };
}

export interface RegisteredWebMcpTools {
  /** A snapshot at registration time — the registry itself (`registry.list({source: "webmcp"})`) is the live view once `source.onToolsChanged` has resynced it. */
  readonly toolIds: readonly string[];
  /** Unsubscribes from further page tool-list changes and removes every currently-registered WebMCP tool from `registry`. */
  unregister(): void;
}

/**
 * Registers every tool a page currently declares via WebMCP (`source`) as a
 * `source: "webmcp"` Tool into `registry` — the bridge between a page's own
 * `document.modelContext` and the `ToolRegistry` the Navigator already consumes (#81),
 * mirroring `registerMcpServerTools` (#85). Stays in sync with the page's *live* tool
 * list via `source.onToolsChanged` — a tool the page adds/removes after the initial
 * snapshot is registered/unregistered automatically, not just at page load.
 */
export async function registerWebMcpTools(
  registry: ToolRegistry,
  source: WebMcpSource,
): Promise<Result<RegisteredWebMcpTools, WebMcpSourceError>> {
  const registeredIds = new Set<string>();

  async function sync(): Promise<Result<void, WebMcpSourceError>> {
    const toolsResult = await source.listTools();
    if (isErr(toolsResult)) {
      return toolsResult;
    }

    const nextIds = new Set(
      toolsResult.value.map((descriptor) => buildWebMcpToolId(descriptor.name)),
    );
    for (const id of registeredIds) {
      if (!nextIds.has(id)) {
        registry.unregister(id);
        registeredIds.delete(id);
      }
    }
    for (const descriptor of toolsResult.value) {
      const tool = buildWebMcpTool(source, descriptor);
      registry.register(tool);
      registeredIds.add(tool.id);
    }
    return ok(undefined);
  }

  const initialSync = await sync();
  if (isErr(initialSync)) {
    return initialSync;
  }

  const unsubscribe = source.onToolsChanged(() => {
    // Best-effort: a failed resync leaves the last successfully-synced tools registered
    // rather than tearing anything down — never throws, matching the "graceful no-op,
    // never affects unrelated flows" requirement.
    void sync();
  });

  return ok({
    toolIds: [...registeredIds],
    unregister() {
      unsubscribe();
      for (const id of registeredIds) {
        registry.unregister(id);
      }
      registeredIds.clear();
    },
  });
}

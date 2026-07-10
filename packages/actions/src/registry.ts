import { err } from '@aegis/shared';

import type { Tool, ToolContext, ToolResult, ToolSource } from './tool';
import { ToolExecutionError } from './tool';
import { elevateRisk, type ActionRisk, type ActionRiskContext } from './risk';

/** Optional filter for {@link ToolRegistry.list}. */
export interface ToolListFilter {
  readonly source?: ToolSource;
  readonly risk?: ActionRisk;
}

/**
 * A runtime registry of {@link Tool}s from any source — built-in browser actions,
 * MCP-server tools (#85), or WebMCP page tools (#87) — so the Navigator (`@aegis/agent`)
 * can list, filter, and call them uniformly regardless of where a tool came from.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  /** Removes a previously registered tool, e.g. when a WebMCP page tool tears down on navigation. */
  unregister(id: string): void {
    this.tools.delete(id);
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  /** Lists registered tools, optionally filtered by `source` and/or `risk`. */
  list(filter: ToolListFilter = {}): readonly Tool[] {
    return [...this.tools.values()].filter((tool) => {
      if (filter.source !== undefined && tool.source !== filter.source) {
        return false;
      }
      if (filter.risk !== undefined && tool.risk !== filter.risk) {
        return false;
      }
      return true;
    });
  }

  /**
   * Validates `args` against the tool's `inputSchema` and, if valid, executes it.
   * Unknown tool ids and schema-invalid args are returned as a typed
   * {@link ToolExecutionError} — never thrown — so a hallucinated tool call from the
   * model degrades to a normal error the agent loop can replan from.
   */
  async call(id: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(id);
    if (!tool) {
      return err(new ToolExecutionError('TOOL_UNKNOWN', `Unknown tool "${id}"`));
    }

    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      return err(
        new ToolExecutionError(
          'TOOL_INVALID_ARGS',
          `Invalid args for tool "${id}": ${parsed.error.message}`,
          { cause: parsed.error },
        ),
      );
    }

    return tool.execute(parsed.data, ctx);
  }

  /**
   * Classifies `id`'s risk for the security policy engine (Phase 2, #82): an unknown
   * tool id fails safe as `state_changing` (deny-by-default, matching the old
   * `ActionRegistry`'s behavior). A `source: "browser"` tool's static risk is further
   * elevated by `context` exactly as `classifyActionRisk` already does (e.g. a "Submit
   * Order" element name); any other source's risk is used as declared — `mcp`/`webmcp`
   * tools (#85/#86) assign their own risk at registration time, since there's no
   * page-element context to elevate from.
   */
  classify(id: string, context: ActionRiskContext = {}): ActionRisk {
    const tool = this.tools.get(id);
    if (!tool) {
      return 'state_changing';
    }
    return tool.source === 'browser' ? elevateRisk(tool.risk, context) : tool.risk;
  }
}

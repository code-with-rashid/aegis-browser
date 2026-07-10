import { AegisError, type Result } from '@aegis/shared';
import type { z } from 'zod';

import type { ActionRisk } from './risk';
import type { ExecutorContext } from './executors/types';

/** Where a {@link Tool} comes from — a built-in browser action, an external MCP server, or a page's own WebMCP declaration. */
export type ToolSource = 'browser' | 'mcp' | 'webmcp';

/** How risky invoking a tool is, unsupervised. Reuses the action risk scale (`risk.ts`) so one policy/critic/confirmation stack gates both. */
export type ToolRisk = ActionRisk;

/**
 * The context a {@link Tool}'s `execute` runs with. Currently identical to
 * {@link ExecutorContext} (the live CDP session + tab manager a `browser`-source tool
 * needs) — `mcp`/`webmcp`-source tools (Phase 2 M9/M10) capture their own transport
 * (an `McpClient`, a page binding) via closure at registration time and can ignore it.
 */
export type ToolContext = ExecutorContext;

export type ToolExecutionErrorCode = 'TOOL_UNKNOWN' | 'TOOL_INVALID_ARGS' | 'TOOL_EXECUTION_FAILED';

/** Typed error raised when validating or executing a tool call fails. */
export class ToolExecutionError extends AegisError {
  readonly code: ToolExecutionErrorCode;

  constructor(code: ToolExecutionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/** The outcome of executing one tool call — a typed success value, or a {@link ToolExecutionError}. */
export type ToolResult = Result<unknown, ToolExecutionError>;

/**
 * One callable capability, uniformly shaped whether it's a built-in browser action, a
 * tool exposed by an external MCP server, or a tool a page declares via WebMCP. The
 * Navigator (`@aegis/agent`) selects and invokes tools through this shape alone, so it
 * never needs to know which source a tool came from.
 */
export interface Tool {
  /** Namespaced id, e.g. `"browser.click"`, `"mcp.github.create_issue"`, `"web.checkout"`. */
  readonly id: string;
  readonly source: ToolSource;
  /** Human/model-readable description. Untrusted for `mcp`/`webmcp` tools — sanitize before it reaches a prompt (#82). */
  readonly description: string;
  /** Validates raw call args before `execute` ever sees them. */
  readonly inputSchema: z.ZodType;
  readonly risk: ToolRisk;
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

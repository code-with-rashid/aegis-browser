import type { Action, ToolRegistry, ToolSource } from '@aegis/actions';
import type { PerceptionPayload } from '@aegis/perception';
import type { ElementRef } from '@aegis/shared';

import { identitySanitize, type SanitizeText } from '../sanitize';
import type { ToolCall } from './services';

/** One tool call awaiting approval, described for display — `toolId`/`source`/`argsSummary` let a UI render it distinctly by source (#90), not just as an opaque preview line. */
export interface PendingToolCallPreview {
  readonly toolId: string;
  /** `undefined` only if the tool was somehow unregistered between proposing it and building this preview. */
  readonly source: ToolSource | undefined;
  readonly description: string;
  readonly argsSummary: string | undefined;
}

/**
 * A batch of tool calls awaiting human approval, plus a plain-language preview for each —
 * what the confirmation gate UI (#27) shows the user. Shaped after the Vercel AI SDK's
 * tool-call approval pattern (a pending call the human must approve/deny before it runs)
 * — see `docs/adr/0010-confirmation-gate.md`.
 */
export interface ConfirmationRequest {
  /** Every pending tool call, any source — what the (non-editing) preview list renders (#90). */
  readonly toolCalls: readonly PendingToolCallPreview[];
  /** The `source: "browser"` subset, re-parsed as real `Action`s — only these support the "Edit" flow's per-field text editing (editing an arbitrary MCP/WebMCP tool's args isn't supported). */
  readonly actions: readonly Action[];
  /** One human-readable line per `actions` entry, same order — what "Edit" shows as each field's label. */
  readonly preview: readonly string[];
  /** Why the policy engine required confirmation, if it said. */
  readonly reason?: string;
}

const MAX_PREVIEW_TEXT_LENGTH = 80;
const MAX_ARGS_SUMMARY_LENGTH = 200;

function truncate(text: string): string {
  return text.length > MAX_PREVIEW_TEXT_LENGTH
    ? `${text.slice(0, MAX_PREVIEW_TEXT_LENGTH)}…`
    : text;
}

/** A short, human-scannable rendering of a tool call's args, for audit/preview — not a description, just enough to see what was passed. Shared by the trace (`trace.ts`) and the confirmation preview. */
export function summarizeArgs(args: unknown): string {
  const json = JSON.stringify(args);
  return json.length > MAX_ARGS_SUMMARY_LENGTH
    ? `${json.slice(0, MAX_ARGS_SUMMARY_LENGTH)}…`
    : json;
}

function nameOf(ref: ElementRef, perception: PerceptionPayload | undefined): string {
  const element = perception?.elements.find((candidate) => candidate.ref === ref);
  return element?.name !== undefined && element.name.length > 0 ? element.name : String(ref);
}

function assertNever(value: never): string {
  throw new Error(`Unhandled action type: ${JSON.stringify(value)}`);
}

/** Describes one action in plain language, for a confirmation preview or a trace UI. */
export function describeAction(action: Action, perception: PerceptionPayload | undefined): string {
  switch (action.type) {
    case 'click':
      return `Click "${nameOf(action.ref, perception)}"`;
    case 'input_text':
      return `Enter "${truncate(action.text)}" into "${nameOf(action.ref, perception)}"`;
    case 'scroll':
      return `Scroll ${action.direction}`;
    case 'get_dropdown_options':
      return `Read the options in "${nameOf(action.ref, perception)}"`;
    case 'select_dropdown_option':
      return `Select "${action.value}" in "${nameOf(action.ref, perception)}"`;
    case 'send_keys':
      return `Send keys "${action.keys}"`;
    case 'navigate':
      return `Navigate to ${action.url}`;
    case 'go_back':
      return 'Go back';
    case 'open_tab':
      return action.url !== undefined ? `Open a new tab at ${action.url}` : 'Open a new tab';
    case 'switch_tab':
      return `Switch to tab ${action.tabId}`;
    case 'close_tab':
      return action.tabId !== undefined ? `Close tab ${action.tabId}` : 'Close the current tab';
    case 'wait':
      return `Wait ${action.ms}ms`;
    case 'extract':
      return `Extract: ${truncate(action.instructions)}`;
    case 'done':
      return `Mark the task ${action.success ? 'done' : 'failed'}: ${truncate(action.summary)}`;
    default:
      return assertNever(action);
  }
}

/**
 * Describes one tool call in plain language, for the alignment critic's prompt (#82) —
 * a `source: "browser"` tool call delegates to {@link describeAction} exactly as before;
 * any other tool's `description` is untrusted (it comes from an external MCP server or a
 * page's own WebMCP declaration) and is run through `sanitize` before it's ever included.
 */
export function describeToolCall(
  toolCall: ToolCall,
  toolRegistry: ToolRegistry,
  perception: PerceptionPayload | undefined,
  sanitize: SanitizeText = identitySanitize,
): string {
  const tool = toolRegistry.get(toolCall.toolId);
  if (tool?.source === 'browser') {
    return describeAction(toolCall.args as Action, perception);
  }
  const description = tool !== undefined ? sanitize(tool.description) : '(unregistered tool)';
  return `Call tool "${toolCall.toolId}" (${description})`;
}

/**
 * Builds the {@link ConfirmationRequest} the loop machine surfaces while in `confirming`.
 *
 * `toolCalls` is the full pending batch (any source) — what the preview list renders.
 * `actions` is the `source: "browser"` subset of that same batch, passed separately
 * because it's the only part the "Edit" flow can act on; the caller is responsible for
 * keeping the two in sync (the machine derives both from the same proposed batch).
 */
export function buildConfirmationRequest(
  toolCalls: readonly ToolCall[],
  actions: readonly Action[],
  toolRegistry: ToolRegistry,
  perception: PerceptionPayload | undefined,
  sanitize: SanitizeText = identitySanitize,
  reason?: string,
): ConfirmationRequest {
  return {
    toolCalls: toolCalls.map((toolCall) => ({
      toolId: toolCall.toolId,
      source: toolRegistry.get(toolCall.toolId)?.source,
      description: describeToolCall(toolCall, toolRegistry, perception, sanitize),
      argsSummary: summarizeArgs(toolCall.args),
    })),
    actions,
    preview: actions.map((action) => describeAction(action, perception)),
    ...(reason !== undefined ? { reason } : {}),
  };
}

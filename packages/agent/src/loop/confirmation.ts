import type { Action, ToolRegistry } from '@aegis/actions';
import type { PerceptionPayload } from '@aegis/perception';
import type { ElementRef } from '@aegis/shared';

import { identitySanitize, type SanitizeText } from '../sanitize';
import type { ToolCall } from './services';

/**
 * A state-changing action (or set of actions) awaiting human approval, plus a
 * plain-language preview for each — what the confirmation gate UI (#27) shows the user.
 * Shaped after the Vercel AI SDK's tool-call approval pattern (a pending call the human
 * must approve/deny before it runs) — see `docs/adr/0010-confirmation-gate.md`.
 */
export interface ConfirmationRequest {
  readonly actions: readonly Action[];
  /** One human-readable line per action, same order as `actions`. */
  readonly preview: readonly string[];
  /** Why the policy engine required confirmation, if it said. */
  readonly reason?: string;
}

const MAX_PREVIEW_TEXT_LENGTH = 80;

function truncate(text: string): string {
  return text.length > MAX_PREVIEW_TEXT_LENGTH
    ? `${text.slice(0, MAX_PREVIEW_TEXT_LENGTH)}…`
    : text;
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

/** Builds the {@link ConfirmationRequest} the loop machine surfaces while in `confirming`. */
export function buildConfirmationRequest(
  actions: readonly Action[],
  perception: PerceptionPayload | undefined,
  reason?: string,
): ConfirmationRequest {
  return {
    actions,
    preview: actions.map((action) => describeAction(action, perception)),
    ...(reason !== undefined ? { reason } : {}),
  };
}

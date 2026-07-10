import { err, isErr } from '@aegis/shared';
import type { z } from 'zod';

import { executeAction } from './executors/dispatch';
import {
  ClickActionSchema,
  CloseTabActionSchema,
  DoneActionSchema,
  ExtractActionSchema,
  GetDropdownOptionsActionSchema,
  GoBackActionSchema,
  InputTextActionSchema,
  NavigateActionSchema,
  OpenTabActionSchema,
  ScrollActionSchema,
  SelectDropdownOptionActionSchema,
  SendKeysActionSchema,
  SwitchTabActionSchema,
  WaitActionSchema,
  type Action,
} from './schema';
import type { ActionRisk } from './risk';
import { ToolRegistry } from './registry';
import { ToolExecutionError, type Tool, type ToolContext, type ToolResult } from './tool';

interface BrowserToolSpec {
  readonly type: Action['type'];
  readonly schema: z.ZodType;
  readonly description: string;
  readonly risk: ActionRisk;
}

const BROWSER_TOOL_SPECS: readonly BrowserToolSpec[] = [
  {
    type: 'click',
    schema: ClickActionSchema,
    description: 'Click an element on the page.',
    risk: 'input',
  },
  {
    type: 'input_text',
    schema: InputTextActionSchema,
    description: 'Type text into an input element, replacing any existing content.',
    risk: 'input',
  },
  {
    type: 'scroll',
    schema: ScrollActionSchema,
    description: 'Scroll an element or the page.',
    risk: 'input',
  },
  {
    type: 'navigate',
    schema: NavigateActionSchema,
    description: 'Navigate the current tab to a URL.',
    risk: 'navigate',
  },
  {
    type: 'go_back',
    schema: GoBackActionSchema,
    description: 'Go back to the previous page in history.',
    risk: 'navigate',
  },
  {
    type: 'open_tab',
    schema: OpenTabActionSchema,
    description: 'Open a new browser tab.',
    risk: 'navigate',
  },
  {
    type: 'switch_tab',
    schema: SwitchTabActionSchema,
    description: 'Switch to a different open tab.',
    risk: 'navigate',
  },
  {
    type: 'close_tab',
    schema: CloseTabActionSchema,
    description: 'Close a browser tab.',
    risk: 'navigate',
  },
  {
    type: 'get_dropdown_options',
    schema: GetDropdownOptionsActionSchema,
    description: 'Read the available options of a dropdown (`<select>`) element.',
    risk: 'read',
  },
  {
    type: 'select_dropdown_option',
    schema: SelectDropdownOptionActionSchema,
    description: 'Select an option in a dropdown (`<select>`) element.',
    risk: 'input',
  },
  {
    type: 'send_keys',
    schema: SendKeysActionSchema,
    description: 'Send a key combination (e.g. "Ctrl+A") to the focused element.',
    risk: 'input',
  },
  {
    type: 'wait',
    schema: WaitActionSchema,
    description: 'Wait for a fixed duration.',
    risk: 'read',
  },
  {
    type: 'extract',
    schema: ExtractActionSchema,
    description: "Extract the current page's readable text content.",
    risk: 'read',
  },
  {
    type: 'done',
    schema: DoneActionSchema,
    description: 'Signal that the task is complete.',
    risk: 'read',
  },
];

async function executeBrowserTool(action: Action, ctx: ToolContext): Promise<ToolResult> {
  const result = await executeAction(ctx, action);
  if (isErr(result)) {
    return err(
      new ToolExecutionError('TOOL_EXECUTION_FAILED', result.error.message, {
        cause: result.error,
      }),
    );
  }
  return result;
}

/**
 * Builds one {@link Tool} per built-in browser action (`browser.<type>`, e.g.
 * `"browser.click"`), each wrapping {@link executeAction} unchanged. Risk matches the
 * existing `BASE_RISK` table in `risk.ts` — contextual elevation to `state_changing`
 * (e.g. a "Submit Order" button) still runs separately via `classifyActionRisk`/
 * `elevateRisk`, since a `Tool`'s `risk` is static but element-name context is only known
 * at call time.
 */
export function createBrowserTools(): readonly Tool[] {
  return BROWSER_TOOL_SPECS.map((spec): Tool => ({
    id: `browser.${spec.type}`,
    source: 'browser',
    description: spec.description,
    inputSchema: spec.schema,
    risk: spec.risk,
    execute: (args, ctx) => executeBrowserTool(args as Action, ctx),
  }));
}

/** Builds a {@link ToolRegistry} pre-populated with all 14 built-in browser tools. */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of createBrowserTools()) {
    registry.register(tool);
  }
  return registry;
}

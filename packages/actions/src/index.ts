export * from './schema';

export type { ActionRisk, ActionRiskContext } from './risk';
export { STATE_CHANGING_KEYWORDS, classifyActionRisk, elevateRisk } from './risk';

export type { ActionValidationErrorCode } from './validate-action';
export { ActionValidationError, validateAction } from './validate-action';

export type {
  ToolSource,
  ToolRisk,
  ToolContext,
  ToolResult,
  ToolExecutionErrorCode,
  Tool,
} from './tool';
export { ToolExecutionError } from './tool';

export type { ToolListFilter } from './registry';
export { ToolRegistry } from './registry';

export { createBrowserTools, createDefaultToolRegistry } from './browser-tools';

export type {
  ActionExecutionErrorCode,
  ExecutorContext,
  DropdownOption,
  ActionResult,
  ClickResult,
  InputTextResult,
  ScrollResult,
  GetDropdownOptionsResult,
  SelectDropdownOptionResult,
  SendKeysResult,
  NavigateResult,
  GoBackResult,
  OpenTabResult,
  SwitchTabResult,
  CloseTabResult,
  WaitResult,
  ExtractResult,
  DoneResult,
} from './executors/types';
export { ActionExecutionError } from './executors/types';
export { executeAction } from './executors/dispatch';
export { backendNodeIdOfRef, resolveRef, focusElement } from './executors/resolve-ref';
export { parseKeyCombo } from './executors/key-map';

export type { TabManagerErrorCode } from './tabs/tab-manager';
export { TabManagerError } from './tabs/tab-manager';
export type { TabManager } from './tabs/tab-manager';
export { createChromeTabManager } from './tabs/chrome-tab-manager';
export type { FakeTabManager } from './tabs/fake-tab-manager';
export { createFakeTabManager } from './tabs/fake-tab-manager';

export { actionSignature } from './runner/action-signature';
export type {
  ActionRunResult,
  RunActionsOptions,
  RunOutcome,
  ActionRunner,
} from './runner/action-runner';
export { createActionRunner } from './runner/action-runner';

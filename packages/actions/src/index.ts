export * from './schema';

export type { ActionRisk, ActionRiskContext } from './risk';
export { STATE_CHANGING_KEYWORDS, classifyActionRisk, elevateRisk } from './risk';

export type { ActionValidationErrorCode, RegisteredAction, ActionDescriptor } from './registry';
export {
  ActionValidationError,
  ActionRegistry,
  createDefaultActionRegistry,
  validateAction,
} from './registry';

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

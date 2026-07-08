import { err, isErr, ok, type Result } from '@aegis/shared';

import type { CloseTabAction, OpenTabAction, SwitchTabAction } from '../schema';
import type { TabManager } from '../tabs/tab-manager';
import {
  ActionExecutionError,
  type CloseTabResult,
  type OpenTabResult,
  type SwitchTabResult,
} from './types';

export async function executeOpenTab(
  tabManager: TabManager,
  action: OpenTabAction,
): Promise<Result<OpenTabResult, ActionExecutionError>> {
  const result = await tabManager.openTab(action.url);
  if (isErr(result)) {
    return err(
      new ActionExecutionError('TAB_OPERATION_FAILED', 'Failed to open a new tab', {
        cause: result.error,
      }),
    );
  }
  return ok({ kind: 'open_tab', tabId: result.value.tabId });
}

export async function executeSwitchTab(
  tabManager: TabManager,
  action: SwitchTabAction,
): Promise<Result<SwitchTabResult, ActionExecutionError>> {
  const result = await tabManager.switchTab(action.tabId);
  if (isErr(result)) {
    return err(
      new ActionExecutionError('TAB_OPERATION_FAILED', `Failed to switch to tab ${action.tabId}`, {
        cause: result.error,
      }),
    );
  }
  return ok({ kind: 'switch_tab' });
}

export async function executeCloseTab(
  tabManager: TabManager,
  action: CloseTabAction,
): Promise<Result<CloseTabResult, ActionExecutionError>> {
  const result = await tabManager.closeTab(action.tabId);
  if (isErr(result)) {
    return err(
      new ActionExecutionError('TAB_OPERATION_FAILED', 'Failed to close tab', {
        cause: result.error,
      }),
    );
  }
  return ok({ kind: 'close_tab' });
}

import { captureScreenshot } from '@aegis/perception';
import { err, isErr, isOk, type Result } from '@aegis/shared';

import type { Action } from '../schema';
import {
  executeClick,
  executeGetDropdownOptions,
  executeInputText,
  executeScroll,
  executeSelectDropdownOption,
  executeSendKeys,
} from './element-executors';
import { executeDone, executeExtract, executeWait } from './meta-executors';
import { executeGoBack, executeNavigate } from './navigation-executors';
import { executeCloseTab, executeOpenTab, executeSwitchTab } from './tab-executors';
import { ActionExecutionError, type ActionResult, type ExecutorContext } from './types';

export type { ExecutorContext };

function assertNever(value: never): never {
  throw new ActionExecutionError(
    'UNSUPPORTED_ACTION',
    `Unhandled action type: ${JSON.stringify(value)}`,
  );
}

async function dispatch(
  context: ExecutorContext,
  action: Action,
): Promise<Result<ActionResult, ActionExecutionError>> {
  switch (action.type) {
    case 'click':
      return executeClick(context.session, action);
    case 'input_text':
      return executeInputText(context.session, action);
    case 'scroll':
      return executeScroll(context.session, action);
    case 'get_dropdown_options':
      return executeGetDropdownOptions(context.session, action);
    case 'select_dropdown_option':
      return executeSelectDropdownOption(context.session, action);
    case 'send_keys':
      return executeSendKeys(context.session, action);
    case 'navigate':
      return executeNavigate(context.session, action);
    case 'go_back':
      return executeGoBack(context.session);
    case 'open_tab':
      return executeOpenTab(context.tabManager, action);
    case 'switch_tab':
      return executeSwitchTab(context.tabManager, action);
    case 'close_tab':
      return executeCloseTab(context.tabManager, action);
    case 'wait':
      return executeWait(action);
    case 'extract':
      return executeExtract(context.session, action);
    case 'done':
      return Promise.resolve(executeDone(action));
    default:
      return assertNever(action);
  }
}

/**
 * Executes one validated action against a live page, dispatching to the right CDP (or
 * tab-manager) executor by `action.type`. On failure, best-effort attaches a screenshot
 * so the agent loop / trace UI can show what the page looked like when the action
 * failed — screenshot capture failing never masks the original error.
 */
export async function executeAction(
  context: ExecutorContext,
  action: Action,
): Promise<Result<ActionResult, ActionExecutionError>> {
  const result = await dispatch(context, action);
  if (isOk(result)) {
    return result;
  }

  const screenshotResult = await captureScreenshot(context.session);
  if (isErr(screenshotResult)) {
    return result;
  }

  return err(
    new ActionExecutionError(result.error.code, result.error.message, {
      cause: result.error.cause,
      screenshot: screenshotResult.value,
    }),
  );
}

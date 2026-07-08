import { AegisError } from '@aegis/shared';
import type { CapturedScreenshot, CdpSession } from '@aegis/perception';

import type { TabManager } from '../tabs/tab-manager';

export type ActionExecutionErrorCode =
  | 'REF_NOT_FOUND'
  | 'ELEMENT_DETACHED'
  | 'CDP_SEND_FAILED'
  | 'TAB_OPERATION_FAILED'
  | 'UNSUPPORTED_ACTION';

/** Typed error raised when executing a validated action against a live page fails. */
export class ActionExecutionError extends AegisError {
  readonly code: ActionExecutionErrorCode;
  readonly screenshot?: CapturedScreenshot;

  constructor(
    code: ActionExecutionErrorCode,
    message: string,
    options?: { cause?: unknown; screenshot?: CapturedScreenshot },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.code = code;
    if (options?.screenshot !== undefined) {
      this.screenshot = options.screenshot;
    }
  }
}

/** Everything an executor needs to act on the page or the browser's tab strip. */
export interface ExecutorContext {
  readonly session: CdpSession;
  readonly tabManager: TabManager;
}

/** One `<select>` option, as read from the live DOM. */
export interface DropdownOption {
  readonly value: string;
  readonly label: string;
}

export interface ClickResult {
  readonly kind: 'click';
}
export interface InputTextResult {
  readonly kind: 'input_text';
}
export interface ScrollResult {
  readonly kind: 'scroll';
}
export interface GetDropdownOptionsResult {
  readonly kind: 'get_dropdown_options';
  readonly options: readonly DropdownOption[];
}
export interface SelectDropdownOptionResult {
  readonly kind: 'select_dropdown_option';
}
export interface SendKeysResult {
  readonly kind: 'send_keys';
}
export interface NavigateResult {
  readonly kind: 'navigate';
  readonly url: string;
}
export interface GoBackResult {
  readonly kind: 'go_back';
}
export interface OpenTabResult {
  readonly kind: 'open_tab';
  readonly tabId: number;
}
export interface SwitchTabResult {
  readonly kind: 'switch_tab';
}
export interface CloseTabResult {
  readonly kind: 'close_tab';
}
export interface WaitResult {
  readonly kind: 'wait';
}
export interface ExtractResult {
  readonly kind: 'extract';
  readonly text: string;
}
export interface DoneResult {
  readonly kind: 'done';
  readonly success: boolean;
  readonly summary: string;
}

/** The typed result of executing any one action. */
export type ActionResult =
  | ClickResult
  | InputTextResult
  | ScrollResult
  | GetDropdownOptionsResult
  | SelectDropdownOptionResult
  | SendKeysResult
  | NavigateResult
  | GoBackResult
  | OpenTabResult
  | SwitchTabResult
  | CloseTabResult
  | WaitResult
  | ExtractResult
  | DoneResult;

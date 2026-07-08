import { AegisError, type Result } from '@aegis/shared';

export type TabManagerErrorCode = 'TAB_OPEN_FAILED' | 'TAB_SWITCH_FAILED' | 'TAB_CLOSE_FAILED';

/** Typed error raised by a {@link TabManager} operation. */
export class TabManagerError extends AegisError {
  readonly code: TabManagerErrorCode;

  constructor(code: TabManagerErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/**
 * Manages browser tabs. Kept separate from `CdpSession`/CDP's `Target` domain: CDP
 * target ids are a different id space than `chrome.tabs` ids, and tab
 * open/switch/close is a `chrome.tabs` concern, not a page-CDP concern.
 */
export interface TabManager {
  readonly currentTabId: number | undefined;
  openTab(url?: string): Promise<Result<{ tabId: number }, TabManagerError>>;
  switchTab(tabId: number): Promise<Result<undefined, TabManagerError>>;
  /** Closes `tabId`, or the current tab if omitted. */
  closeTab(tabId?: number): Promise<Result<undefined, TabManagerError>>;
}

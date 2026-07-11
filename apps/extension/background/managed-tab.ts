import { AegisError, err, ok, type Result } from '@aegis/shared';

export type ManagedTabErrorCode = 'MANAGED_TAB_OPEN_FAILED' | 'MANAGED_TAB_CLOSE_FAILED';

/** Typed error raised opening or closing a managed tab. */
export class ManagedTabError extends AegisError {
  readonly code: ManagedTabErrorCode;

  constructor(code: ManagedTabErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/**
 * Opens a real, `chrome.debugger`-attachable tab that isn't the user's active tab — what
 * a background workflow run drives (#115), so it can proceed with no side panel open and
 * without stealing the user's foreground tab. `chrome.debugger.attach` works against any
 * tab regardless of focus, so a plain non-active `chrome.tabs.create` is all a "managed
 * tab" needs to be — there's no use for `chrome.offscreen` here: an offscreen document
 * can't navigate to an arbitrary third-party origin or be `chrome.debugger`-attached the
 * way a real tab can (`docs/adr/0049-background-run-engine.md`).
 */
export async function openManagedTab(
  url: string,
): Promise<Result<{ tabId: number }, ManagedTabError>> {
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    if (tab.id === undefined) {
      return err(new ManagedTabError('MANAGED_TAB_OPEN_FAILED', 'Created tab has no id'));
    }
    return ok({ tabId: tab.id });
  } catch (cause) {
    return err(
      new ManagedTabError('MANAGED_TAB_OPEN_FAILED', 'Failed to open a managed tab', { cause }),
    );
  }
}

/** Closes a managed tab once its run finishes — a no-op success if the tab is already gone (the user may have closed it manually mid-run). */
export async function closeManagedTab(tabId: number): Promise<Result<undefined, ManagedTabError>> {
  try {
    await chrome.tabs.remove(tabId);
    return ok(undefined);
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('No tab with id')) {
      return ok(undefined);
    }
    return err(
      new ManagedTabError('MANAGED_TAB_CLOSE_FAILED', `Failed to close tab ${tabId}`, { cause }),
    );
  }
}

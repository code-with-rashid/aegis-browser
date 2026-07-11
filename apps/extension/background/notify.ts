import { AegisError, err, ok, type Result } from '@aegis/shared';

export type NotifyErrorCode = 'NOTIFY_FAILED';

/** Typed error raised showing a notification. */
export class NotifyError extends AegisError {
  readonly code: NotifyErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = 'NOTIFY_FAILED';
  }
}

/**
 * A minimal, valid 1x1 PNG, inlined as a data URI — the extension has no icon asset of
 * its own yet; `chrome.notifications.create`'s `iconUrl` is required regardless, so this
 * is a self-contained placeholder rather than a reference to a file that doesn't exist.
 */
const PLACEHOLDER_ICON_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/**
 * Notifies the user that a background workflow run was blocked (#117's "hard-stop +
 * notify" scope item) — a run that hits an out-of-policy action stops silently
 * otherwise, and "safe autonomy" means the user finds out, not just that nothing bad
 * happened. Best-effort: a notification failure (e.g. OS-level notification permission
 * denied) never affects the run itself, which has already stopped by the time this runs.
 */
export async function notifyRunBlocked(
  workflowName: string,
  reason: string,
): Promise<Result<void, NotifyError>> {
  try {
    // @types/chrome has no Promise-returning overload for notifications.create
    // (unlike e.g. tabs.create) — wrap its callback form ourselves.
    await new Promise<void>((resolve, reject) => {
      try {
        chrome.notifications.create(
          {
            type: 'basic',
            iconUrl: PLACEHOLDER_ICON_DATA_URI,
            title: `Background run of "${workflowName}" was blocked`,
            message: reason,
          },
          () => {
            if (chrome.runtime.lastError !== undefined) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve();
          },
        );
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
    return ok(undefined);
  } catch (cause) {
    return err(new NotifyError('Failed to show a notification', { cause }));
  }
}

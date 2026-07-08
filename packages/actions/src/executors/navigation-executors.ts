import { err, isErr, ok, type Result } from '@aegis/shared';
import type { CdpSession } from '@aegis/perception';

import type { NavigateAction } from '../schema';
import { ActionExecutionError, type GoBackResult, type NavigateResult } from './types';

export async function executeNavigate(
  session: CdpSession,
  action: NavigateAction,
): Promise<Result<NavigateResult, ActionExecutionError>> {
  const result = await session.send('Page.navigate', { url: action.url });
  if (isErr(result)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', `Failed to navigate to "${action.url}"`, {
        cause: result.error,
      }),
    );
  }
  if (result.value.errorText !== undefined) {
    return err(
      new ActionExecutionError(
        'CDP_SEND_FAILED',
        `Navigation to "${action.url}" failed: ${result.value.errorText}`,
      ),
    );
  }

  return ok({ kind: 'navigate', url: action.url });
}

export async function executeGoBack(
  session: CdpSession,
): Promise<Result<GoBackResult, ActionExecutionError>> {
  const historyResult = await session.send('Page.getNavigationHistory');
  if (isErr(historyResult)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to read navigation history', {
        cause: historyResult.error,
      }),
    );
  }

  const { currentIndex, entries } = historyResult.value;
  const previousEntry = entries[currentIndex - 1];
  if (previousEntry === undefined) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'No previous entry in navigation history'),
    );
  }

  const navigateResult = await session.send('Page.navigateToHistoryEntry', {
    entryId: previousEntry.id,
  });
  if (isErr(navigateResult)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to navigate to previous history entry', {
        cause: navigateResult.error,
      }),
    );
  }

  return ok({ kind: 'go_back' });
}

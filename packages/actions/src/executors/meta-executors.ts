import { err, isErr, ok, type Result } from '@aegis/shared';
import { getDomPerception, type CdpSession } from '@aegis/perception';

import type { DoneAction, ExtractAction, WaitAction } from '../schema';
import {
  ActionExecutionError,
  type DoneResult,
  type ExtractResult,
  type WaitResult,
} from './types';

export async function executeWait(
  action: WaitAction,
): Promise<Result<WaitResult, ActionExecutionError>> {
  await new Promise<void>((resolve) => setTimeout(resolve, action.ms));
  return ok({ kind: 'wait' });
}

/** `instructions` guides how the LLM interprets the extracted text; the executor just reads the page. */
export async function executeExtract(
  session: CdpSession,
  _action: ExtractAction,
): Promise<Result<ExtractResult, ActionExecutionError>> {
  const domResult = await getDomPerception(session);
  if (isErr(domResult)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to extract page content', {
        cause: domResult.error,
      }),
    );
  }

  return ok({ kind: 'extract', text: domResult.value.content.text });
}

export function executeDone(action: DoneAction): Result<DoneResult, ActionExecutionError> {
  return ok({ kind: 'done', success: action.success, summary: action.summary });
}

import { isErr } from '@aegis/shared';

import type { RunSummary, ToolRunOutcome } from './services';

/**
 * Flattens a {@link ToolRunOutcome} into plain data, extracting error `code`/`message` as
 * strings so the summary — unlike the raw outcome, which nests `Error` instances inside
 * each result — round-trips cleanly through `chrome.storage` (which serializes via JSON).
 */
export function summarizeRunOutcome(outcome: ToolRunOutcome): RunSummary {
  return {
    kind: outcome.kind,
    toolCalls: outcome.results.map((result) => {
      if (isErr(result.outcome)) {
        return {
          toolId: result.toolCall.toolId,
          succeeded: false,
          errorCode: result.outcome.error.code,
          errorMessage: result.outcome.error.message,
        };
      }
      return { toolId: result.toolCall.toolId, succeeded: true };
    }),
  };
}

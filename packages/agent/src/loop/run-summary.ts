import type { RunOutcome } from '@aegis/actions';
import { isErr } from '@aegis/shared';

/** A plain-data summary of one attempted action — safe to persist (no `Error` instances). */
export interface ActionOutcomeSummary {
  readonly type: string;
  readonly succeeded: boolean;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

/** A plain-data summary of a whole {@link RunOutcome} — what the verifier/UI need, nothing more. */
export interface RunSummary {
  readonly kind: RunOutcome['kind'];
  readonly actions: readonly ActionOutcomeSummary[];
}

/**
 * Flattens a {@link RunOutcome} into plain data, extracting error `code`/`message` as
 * strings so the summary — unlike the raw outcome, which nests `Error` instances inside
 * each result — round-trips cleanly through `chrome.storage` (which serializes via JSON).
 */
export function summarizeRunOutcome(outcome: RunOutcome): RunSummary {
  return {
    kind: outcome.kind,
    actions: outcome.results.map((result) => {
      if (isErr(result.outcome)) {
        return {
          type: result.action.type,
          succeeded: false,
          errorCode: result.outcome.error.code,
          errorMessage: result.outcome.error.message,
        };
      }
      return { type: result.action.type, succeeded: true };
    }),
  };
}

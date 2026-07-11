/** What actually happened when a background workflow run finished (or didn't, within the timeout). */
export type WorkflowRunOutcome = 'completed' | 'hard_stopped' | 'failed' | 'timeout';

export interface WorkflowHealEvalResult {
  readonly cleanReplayOutcome: WorkflowRunOutcome;
  /** Model calls a deterministic replay against the *unchanged* fixture made — must be 0: nothing needed healing. */
  readonly cleanReplayCallCount: number;
  readonly healedReplayOutcome: WorkflowRunOutcome;
  /** Model calls the *healed* replay made — exactly the self-heal's own Navigator-only call, never a full re-plan. */
  readonly healedReplayCallCount: number;
  readonly durationMs: number;
  /** Set when the run threw before reaching any terminal state (a harness failure, not an eval failure). */
  readonly error?: string;
}

export interface WorkflowHealEvalScore extends WorkflowHealEvalResult {
  readonly healSucceeded: boolean;
  readonly passed: boolean;
}

const MAX_HEALED_CALL_COUNT = 2;

/**
 * Passes only if: the clean replay completed with *zero* model calls (proving a
 * deterministic replay never plans at all), and the healed replay both completed and
 * needed a small, bounded number of calls (proving self-heal recovers via one targeted
 * Navigator call, not a full multi-step re-plan) — the "measure heal success + planner-
 * call reduction" acceptance criterion (#120), made into pass/fail rather than prose.
 */
export function scoreWorkflowHealEval(result: WorkflowHealEvalResult): WorkflowHealEvalScore {
  const healSucceeded = result.healedReplayOutcome === 'completed';
  const passed =
    result.cleanReplayOutcome === 'completed' &&
    result.cleanReplayCallCount === 0 &&
    healSucceeded &&
    result.healedReplayCallCount >= 1 &&
    result.healedReplayCallCount <= MAX_HEALED_CALL_COUNT;

  return { ...result, healSucceeded, passed };
}

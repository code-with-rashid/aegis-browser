/** What actually happened when a task's run finished (or didn't, within the timeout). */
export type TaskOutcome = 'done' | 'failed' | 'stopped' | 'timeout';

export interface TaskRunResult {
  readonly taskId: string;
  readonly outcome: TaskOutcome;
  /** Whether the run's final state contains the task's expected summary substring. */
  readonly summaryMatched: boolean;
  readonly stepCount: number;
  readonly replanCount: number;
  readonly durationMs: number;
  /** Set when the run threw before reaching any terminal state (a harness failure, not a task failure). */
  readonly error?: string;
}

export interface TaskScore extends TaskRunResult {
  readonly passed: boolean;
}

/** A task passes only by reaching `done` with the expected summary present — reaching a terminal state for the wrong reason (or the right one without the right content) still fails. */
export function scoreTask(result: TaskRunResult): TaskScore {
  return { ...result, passed: result.outcome === 'done' && result.summaryMatched };
}

export interface EvalReport {
  readonly version: number;
  readonly scores: readonly TaskScore[];
  readonly passedCount: number;
  readonly totalCount: number;
}

export function buildReport(version: number, results: readonly TaskRunResult[]): EvalReport {
  const scores = results.map(scoreTask);
  return {
    version,
    scores,
    passedCount: scores.filter((score) => score.passed).length,
    totalCount: scores.length,
  };
}

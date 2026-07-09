import type { AgentLoopContext, LoopErrorSummary } from './machine';

export type LoopRunOutcome = 'done' | 'failed' | 'stopped' | 'paused' | 'active';

/** A plain-data report of one loop run — for the trace UI (#26), logs, or a final "here's what happened" message. */
export interface LoopRunSummary {
  readonly outcome: LoopRunOutcome;
  readonly task: string;
  readonly stepCount: number;
  readonly replanCount: number;
  readonly subGoalHistory: readonly string[];
  readonly taskSummary?: string;
  readonly lastError?: LoopErrorSummary;
}

/** The minimal shape of a machine snapshot `summarizeLoopRun` needs — matches `actor.getSnapshot()`. */
export interface LoopSnapshotLike {
  readonly value: unknown;
  readonly context: AgentLoopContext;
}

/** State values `summarizeLoopRun` reports verbatim as the outcome — everything else means "actively working," reported as `'active'`. */
const NAMED_STATE_VALUES: ReadonlySet<unknown> = new Set(['done', 'failed', 'stopped', 'paused']);

function outcomeOf(value: unknown): LoopRunOutcome {
  return NAMED_STATE_VALUES.has(value) ? (value as LoopRunOutcome) : 'active';
}

/**
 * Builds a graceful, plain-data summary of a loop run from its (typically final)
 * snapshot — works for any state, not just terminal ones, so a UI can show progress
 * mid-run using the same shape it uses for the final report.
 */
export function summarizeLoopRun(snapshot: LoopSnapshotLike): LoopRunSummary {
  const { context } = snapshot;
  return {
    outcome: outcomeOf(snapshot.value),
    task: context.task,
    stepCount: context.stepCount,
    replanCount: context.replanCount,
    subGoalHistory: context.subGoalHistory,
    ...(context.taskSummary !== undefined ? { taskSummary: context.taskSummary } : {}),
    ...(context.lastError !== undefined ? { lastError: context.lastError } : {}),
  };
}

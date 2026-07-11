import type { RunPolicy, Workflow } from '../schema';

const ONE_DAY_MS = 24 * 60 * 60_000;

/**
 * Whether `workflow` has already had `runPolicy.maxRunsPerDay` (or more) runs start within
 * the last 24 hours — the "rate cap" half of #117's `RunPolicy` enforcement. A caller
 * checks this before starting a new background run; `undefined` (no cap configured) never
 * limits anything. `recentRunStartTimes` is every recent run's `startedAt` for this
 * workflow — the caller supplies it (typically from `WorkflowRunStore.listRunsForWorkflow`)
 * so this stays a pure function of data, not a storage-reading one.
 */
export function hasReachedDailyRunLimit(
  runPolicy: RunPolicy,
  recentRunStartTimes: readonly number[],
  now: number,
): boolean {
  if (runPolicy.maxRunsPerDay === undefined) {
    return false;
  }
  const dayAgo = now - ONE_DAY_MS;
  const runsToday = recentRunStartTimes.filter((startedAt) => startedAt >= dayAgo).length;
  return runsToday >= runPolicy.maxRunsPerDay;
}

/** Whether `workflow` has more steps than `runPolicy.maxStepsPerRun` allows — the "spending cap" half of #117's `RunPolicy` enforcement. `undefined` (no cap configured) never limits anything. */
export function exceedsMaxSteps(workflow: Pick<Workflow, 'steps'>, runPolicy: RunPolicy): boolean {
  if (runPolicy.maxStepsPerRun === undefined) {
    return false;
  }
  return workflow.steps.length > runPolicy.maxStepsPerRun;
}

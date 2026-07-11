import type { Result, StoragePort } from '@aegis/shared';
import {
  createWorkflowScheduleStore,
  findDueSchedules,
  type WorkflowId,
  type WorkflowRunRecord,
  type WorkflowScheduleStore,
} from '@aegis/workflows';

import type { BackgroundRunError, BackgroundRunManager } from './background-run-manager';

/**
 * Fires due schedules and exposes a manual trigger (#116) — the `chrome.alarms`-based
 * "cron-like" scheduling scope item. `checkSchedules` is pure orchestration; the actual
 * "is it due" logic lives in `@aegis/workflows`' `findDueSchedules` (testable with fixed
 * timestamps, no real alarm needs to fire to verify it). `schedules` is exposed directly
 * (rather than wrapped in new enable/disable methods) since there's no dedicated
 * schedule-management messaging protocol yet — that's #118/#119 UI work — and
 * `WorkflowScheduleStore.upsertSchedule`/`updateSchedule` already cover "enable/disable
 * per workflow" completely.
 */
export interface Scheduler {
  readonly schedules: WorkflowScheduleStore;
  /** Checks every enabled schedule against `now` and starts a background run for each one due — called from a recurring `chrome.alarms` handler. */
  checkSchedules(now: number): Promise<void>;
  /** Manually triggers a workflow's background run right now, ignoring its schedule. */
  triggerNow(
    workflowId: WorkflowId,
    values: Readonly<Record<string, string>>,
  ): Promise<Result<WorkflowRunRecord, BackgroundRunError>>;
}

export function createScheduler(
  /** `chrome.storage.local` in production — a schedule must survive a browser restart. */
  scheduleStorage: StoragePort,
  runManager: BackgroundRunManager,
): Scheduler {
  const scheduleStore = createWorkflowScheduleStore(scheduleStorage);

  return {
    schedules: scheduleStore,

    async checkSchedules(now) {
      const listResult = await scheduleStore.listSchedules();
      if (!listResult.ok) {
        return;
      }

      for (const schedule of findDueSchedules(listResult.value, now)) {
        await scheduleStore.updateSchedule(schedule.workflowId, { lastRunAt: now });
        void runManager.startBackgroundRun(schedule.workflowId, schedule.values);
      }
    },

    triggerNow(workflowId, values) {
      return runManager.startBackgroundRun(workflowId, values);
    },
  };
}

import type { WorkflowSchedule } from './workflow-schedule';

function todaysOccurrence(hour: number, minute: number, now: number): number {
  const nowDate = new Date(now);
  return new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
    hour,
    minute,
    0,
    0,
  ).getTime();
}

/**
 * Whether `schedule` should fire right now, given `now` — a pure function of the
 * schedule and the clock, so it's testable with fixed timestamps and needs no real
 * `chrome.alarms` firing to verify (#116). `interval` compares elapsed time since
 * `lastRunAt` (or fires immediately if it's never run); `daily` never fires before
 * *today's* `hour:minute` has arrived — a fresh, never-run schedule waits for the next
 * real occurrence rather than firing immediately for a "missed" occurrence from before it
 * existed — and, once that time has passed, fires once (not fired again since).
 */
export function isScheduleDue(schedule: WorkflowSchedule, now: number): boolean {
  if (!schedule.enabled) {
    return false;
  }

  switch (schedule.trigger.kind) {
    case 'interval': {
      if (schedule.lastRunAt === undefined) {
        return true;
      }
      const elapsedMs = now - schedule.lastRunAt;
      return elapsedMs >= schedule.trigger.everyMinutes * 60_000;
    }
    case 'daily': {
      const occurrence = todaysOccurrence(schedule.trigger.hour, schedule.trigger.minute, now);
      if (now < occurrence) {
        return false;
      }
      return schedule.lastRunAt === undefined || schedule.lastRunAt < occurrence;
    }
  }
}

/** Every enabled schedule due to fire right now — what a `chrome.alarms` handler starts a background run for (#116). */
export function findDueSchedules(
  schedules: readonly WorkflowSchedule[],
  now: number,
): readonly WorkflowSchedule[] {
  return schedules.filter((schedule) => isScheduleDue(schedule, now));
}

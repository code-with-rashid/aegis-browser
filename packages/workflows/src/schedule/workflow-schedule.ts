import { z } from 'zod';

import { WorkflowIdSchema } from '../schema/workflow';

/**
 * When a scheduled run is due — deliberately not a real cron string (`chrome.alarms`
 * itself only fires on a fixed period or a specific time, never parses cron syntax): an
 * `interval` fires every `everyMinutes`; a `daily` fires once each day at `hour:minute`
 * (in the browser's local time, since that's what a user scheduling "every day at 9am"
 * means). Covers the realistic unattended-workflow scheduling cases without taking on a
 * full cron parser.
 */
export const ScheduleTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('interval'), everyMinutes: z.number().int().positive() }),
  z.object({
    kind: z.literal('daily'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
]);
export type ScheduleTrigger = z.infer<typeof ScheduleTriggerSchema>;

/**
 * One workflow's schedule (#116) — at most one per workflow (`workflowId` is the key a
 * {@link WorkflowScheduleStore} stores it under), matching the issue's "enable/disable
 * *per workflow*" framing rather than letting one workflow accumulate many independent
 * schedules. `enabled: false` keeps the configuration around (so re-enabling doesn't lose
 * the trigger/values) without ever firing. `lastRunAt` is what `isScheduleDue` measures
 * an `interval` trigger's next fire time from, and what keeps a `daily` trigger from
 * firing twice in the same day.
 */
export const WorkflowScheduleSchema = z.object({
  workflowId: WorkflowIdSchema,
  enabled: z.boolean(),
  trigger: ScheduleTriggerSchema,
  values: z.record(z.string(), z.string()).default({}),
  lastRunAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type WorkflowSchedule = z.infer<typeof WorkflowScheduleSchema>;

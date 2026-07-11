# 0050: Scheduler + triggers

## Status

Accepted

## Context

#115 built the engine that can run a workflow unattended; nothing yet decides _when_ one
should run. #116 asks for `chrome.alarms`-based scheduling ("cron-like"), a manual
trigger, per-workflow enable/disable, and run history with status/outputs.

## Decision

**"Cron-like" means two concrete trigger kinds, not a cron parser.** `chrome.alarms`
itself only supports a fixed period or a specific time — it never parses cron syntax — so
`ScheduleTriggerSchema` (`packages/workflows/src/schedule/workflow-schedule.ts`) is a
discriminated union of `interval` (`everyMinutes`) and `daily` (`hour`/`minute`, local
time). This covers the realistic unattended-workflow scheduling cases ("every N minutes",
"once a day at 9am") without taking on a full cron grammar for a feature no one has asked
for yet.

**A workflow has at most one schedule.** `WorkflowScheduleStore` keys by `WorkflowId`
directly (mirroring the issue's own "enable/disable _per workflow_" framing), and
`upsertSchedule` creates-or-replaces rather than erroring on an existing one — unlike
`WorkflowStore.createWorkflow`, where two distinct workflows colliding on an id is a real
mistake worth catching, a caller re-setting the same workflow's schedule is the normal
case, not an error.

**Due-ness is a pure function of the schedule and the clock**, entirely inside
`@aegis/workflows` (`schedule/due-schedules.ts`'s `isScheduleDue`/`findDueSchedules`) —
testable with fixed timestamps, no real `chrome.alarms` firing needed to verify it. A
`daily` trigger deliberately never fires for a "missed" occurrence from before the
schedule existed: `isScheduleDue` compares against _today's_ `hour:minute` only, returning
`false` outright if that time hasn't arrived yet today — a schedule created at 8am for a
9am daily trigger waits for 9am, it doesn't fire immediately by treating yesterday's
9am as an overdue occurrence. Once today's time has passed, it fires once (checked
against `lastRunAt`), same as an `interval` trigger firing once per elapsed period.

**One polling alarm, not one alarm per schedule.** `chrome.alarms`' own granularity is
already at least a minute; `entrypoints/background.ts` registers a single recurring
`aegis-schedule-check` alarm (`periodInMinutes: 1`) whose handler calls
`Scheduler.checkSchedules(Date.now())`, which re-evaluates every persisted schedule via
`findDueSchedules`. This is simpler than juggling `chrome.alarms.create`/`clear` per
workflow schedule (keeping N alarms in sync with N schedule records) for no real gain —
the due-check itself is cheap, and this is the composition root's only new use of
`chrome.alarms`, requiring the new `"alarms"` manifest permission.

**The "manual trigger" is `Scheduler.triggerNow`, a thin pass-through to
`BackgroundRunManager.startBackgroundRun`** — #115 already built the actual unattended
run engine and its concurrency limiting; #116 doesn't duplicate any of that; it only adds
_when_ to call it (a due schedule) alongside _that a caller can just call it directly_
(bypassing the schedule entirely).

**Run history is #115's `WorkflowRunStore`, extended with one method
(`listRunsForWorkflow`)**, not a new store. Every scheduled or manually-triggered run is
already a `WorkflowRunRecord` (`status`, `stepResults` as outputs, `reason` on failure);
"history with status/outputs" was already satisfied by #115's design — the only gap was a
convenient per-workflow, newest-first accessor, which this issue adds.

**No new messaging protocol; `Scheduler.schedules` is the `WorkflowScheduleStore`
directly.** There's no schedule-management UI yet (#118/#119); exposing the store lets
that future UI call `upsertSchedule`/`updateSchedule` directly rather than routing through
a wrapper this issue would have to invent and the UI issue would have to match anyway.

## Consequences

- A `daily` schedule's timezone is whatever the browser's local clock says — there's no
  per-schedule timezone override. Revisit if that's ever a real user need.
- The 1-minute poll means a `daily` schedule can fire up to ~1 minute after its exact
  `hour:minute` (whenever the alarm next ticks), not at the precise second — acceptable
  for unattended workflow scheduling, not acceptable for anything time-critical.
- `Scheduler.checkSchedules` starts each due run via `startBackgroundRun` without
  awaiting it to completion (fire-and-forget, same pattern `BackgroundRunManager.drive`
  already uses internally) — a slow-to-start run never blocks checking the next schedule.

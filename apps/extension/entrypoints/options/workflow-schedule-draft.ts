import type { ScheduleTrigger, WorkflowSchedule } from '@aegis/workflows';

/** Form-editable shape of a {@link WorkflowSchedule}'s trigger — raw text for the numeric fields, same "avoid `<input type=\"number\">`'s empty-string ambiguity" reasoning as `RunPolicyDraft`. */
export interface ScheduleDraft {
  readonly enabled: boolean;
  readonly kind: ScheduleTrigger['kind'];
  readonly everyMinutes: string;
  readonly hour: string;
  readonly minute: string;
}

const DEFAULT_DRAFT: ScheduleDraft = {
  enabled: false,
  kind: 'interval',
  everyMinutes: '60',
  hour: '9',
  minute: '0',
};

export function draftFromSchedule(schedule: WorkflowSchedule | undefined): ScheduleDraft {
  if (schedule === undefined) {
    return DEFAULT_DRAFT;
  }
  return {
    enabled: schedule.enabled,
    kind: schedule.trigger.kind,
    everyMinutes:
      schedule.trigger.kind === 'interval'
        ? schedule.trigger.everyMinutes.toString()
        : DEFAULT_DRAFT.everyMinutes,
    hour: schedule.trigger.kind === 'daily' ? schedule.trigger.hour.toString() : DEFAULT_DRAFT.hour,
    minute:
      schedule.trigger.kind === 'daily' ? schedule.trigger.minute.toString() : DEFAULT_DRAFT.minute,
  };
}

/** `undefined` if the draft's numeric fields don't parse into a valid trigger — the caller should refuse to save rather than persist a nonsensical schedule. */
export function scheduleTriggerFromDraft(draft: ScheduleDraft): ScheduleTrigger | undefined {
  if (draft.kind === 'interval') {
    const everyMinutes = Number.parseInt(draft.everyMinutes, 10);
    return Number.isFinite(everyMinutes) && everyMinutes > 0
      ? { kind: 'interval', everyMinutes }
      : undefined;
  }
  const hour = Number.parseInt(draft.hour, 10);
  const minute = Number.parseInt(draft.minute, 10);
  return Number.isFinite(hour) &&
    hour >= 0 &&
    hour <= 23 &&
    Number.isFinite(minute) &&
    minute >= 0 &&
    minute <= 59
    ? { kind: 'daily', hour, minute }
    : undefined;
}

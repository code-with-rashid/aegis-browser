import type { WorkflowId, WorkflowScheduleStore } from '@aegis/workflows';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

import {
  draftFromSchedule,
  scheduleTriggerFromDraft,
  type ScheduleDraft,
} from './workflow-schedule-draft';

export interface WorkflowScheduleEditorProps {
  readonly workflowId: WorkflowId;
  readonly scheduleStore: WorkflowScheduleStore;
}

type SaveStatus =
  { readonly status: 'idle' } | { readonly status: 'error'; readonly message: string };

/**
 * Enable/configure/disable a workflow's schedule (#119) — saves independently of
 * `WorkflowBuilderPanel`'s own name/params/steps/policy Save button, since
 * `WorkflowScheduleStore.upsertSchedule` (#116) is its own separate store, not a
 * `WorkflowPatch` field.
 */
export function WorkflowScheduleEditor({
  workflowId,
  scheduleStore,
}: WorkflowScheduleEditorProps): React.JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft>(draftFromSchedule(undefined));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ status: 'idle' });

  useEffect(() => {
    scheduleStore
      .getSchedule(workflowId)
      .then((result) => {
        if (result.ok) {
          setDraft(draftFromSchedule(result.value));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setLoaded(true);
      });
  }, [scheduleStore, workflowId]);

  async function handleSave(): Promise<void> {
    const trigger = scheduleTriggerFromDraft(draft);
    if (trigger === undefined) {
      setSaveStatus({ status: 'error', message: 'Enter a valid interval/time.' });
      return;
    }
    const result = await scheduleStore.upsertSchedule({
      workflowId,
      enabled: draft.enabled,
      trigger,
    });
    setSaveStatus(
      result.ok ? { status: 'idle' } : { status: 'error', message: result.error.message },
    );
  }

  if (!loaded) {
    return <p className="text-xs text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-2 text-xs">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => {
            setDraft({ ...draft, enabled: event.target.checked });
          }}
        />
        Enable scheduling
      </label>
      <label className="flex items-center gap-2">
        Trigger
        <select
          className="rounded border border-border bg-background p-1"
          value={draft.kind}
          onChange={(event) => {
            setDraft({ ...draft, kind: event.target.value as ScheduleDraft['kind'] });
          }}
        >
          <option value="interval">Every N minutes</option>
          <option value="daily">Daily at a time</option>
        </select>
      </label>
      {draft.kind === 'interval' ? (
        <label className="block text-muted-foreground">
          Every (minutes)
          <input
            className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
            value={draft.everyMinutes}
            onChange={(event) => {
              setDraft({ ...draft, everyMinutes: event.target.value });
            }}
          />
        </label>
      ) : (
        <div className="flex gap-2">
          <label className="block text-muted-foreground">
            Hour (0-23)
            <input
              className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
              value={draft.hour}
              onChange={(event) => {
                setDraft({ ...draft, hour: event.target.value });
              }}
            />
          </label>
          <label className="block text-muted-foreground">
            Minute (0-59)
            <input
              className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
              value={draft.minute}
              onChange={(event) => {
                setDraft({ ...draft, minute: event.target.value });
              }}
            />
          </label>
        </div>
      )}
      <Button type="button" size="sm" onClick={() => void handleSave()}>
        Save schedule
      </Button>
      {saveStatus.status === 'error' ? <p className="text-red-600">{saveStatus.message}</p> : null}
    </div>
  );
}

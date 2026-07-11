import type {
  Workflow,
  WorkflowParam,
  WorkflowScheduleStore,
  WorkflowStep,
  WorkflowStore,
} from '@aegis/workflows';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

import {
  draftFromRunPolicy,
  runPolicyFromDraft,
  type RunPolicyDraft,
} from './workflow-run-policy-draft';
import { WorkflowParamsEditor } from './workflow-params-editor';
import { WorkflowRunPolicyEditor } from './workflow-run-policy-editor';
import { WorkflowScheduleEditor } from './workflow-schedule-editor';
import { WorkflowStepsEditor } from './workflow-steps-editor';

export interface WorkflowBuilderPanelProps {
  readonly workflow: Workflow;
  readonly workflowStore: WorkflowStore;
  readonly scheduleStore: WorkflowScheduleStore;
  readonly onClose: () => void;
}

type SaveStatus =
  { readonly status: 'idle' } | { readonly status: 'error'; readonly message: string };

/**
 * Inspect and edit a saved workflow (#119): view/reorder/delete its recorded steps, add/
 * remove/edit its params, edit its `RunPolicy`, and enable/configure scheduling — a full-
 * page swap over `WorkflowLibraryPanel`'s list (`WorkflowLibraryPanel` navigates here
 * instead of #118's old inline "name + param defaults only" section, which this
 * supersedes). "Version history" is shown at the level the data model actually supports
 * today — `version`/`updatedAt` are a running counter and last-edit timestamp, not a
 * snapshot timeline; `Workflow` has never persisted prior revisions, and building that
 * store is a materially bigger feature this issue doesn't ask for.
 */
export function WorkflowBuilderPanel({
  workflow,
  workflowStore,
  scheduleStore,
  onClose,
}: WorkflowBuilderPanelProps): React.JSX.Element {
  const [name, setName] = useState(workflow.name);
  const [params, setParams] = useState<WorkflowParam[]>(workflow.params);
  const [steps, setSteps] = useState<WorkflowStep[]>(workflow.steps);
  const [runPolicyDraft, setRunPolicyDraft] = useState<RunPolicyDraft>(
    draftFromRunPolicy(workflow.authorization),
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ status: 'idle' });

  async function handleSave(): Promise<void> {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setSaveStatus({ status: 'error', message: 'Enter a name.' });
      return;
    }
    const result = await workflowStore.updateWorkflow(workflow.id, {
      name: trimmedName,
      params,
      steps,
      authorization: runPolicyFromDraft(runPolicyDraft),
    });
    if (result.ok) {
      onClose();
    } else {
      setSaveStatus({ status: 'error', message: result.error.message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Edit workflow</h2>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Back to list
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        v{workflow.version} · created {new Date(workflow.createdAt).toLocaleString()} · updated{' '}
        {new Date(workflow.updatedAt).toLocaleString()}
      </p>

      <label className="block text-xs text-muted-foreground">
        Name
        <input
          className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Steps</h3>
        <WorkflowStepsEditor steps={steps} onChange={setSteps} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Params</h3>
        <WorkflowParamsEditor params={params} onChange={setParams} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Run policy</h3>
        <WorkflowRunPolicyEditor draft={runPolicyDraft} onChange={setRunPolicyDraft} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Schedule</h3>
        <WorkflowScheduleEditor workflowId={workflow.id} scheduleStore={scheduleStore} />
      </section>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => void handleSave()}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {saveStatus.status === 'error' ? (
          <p className="text-xs text-red-600">{saveStatus.message}</p>
        ) : null}
      </div>
    </div>
  );
}

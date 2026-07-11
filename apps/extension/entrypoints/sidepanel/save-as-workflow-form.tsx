import { useState } from 'react';

import { Button } from '@/components/ui/button';

import type { SaveWorkflowStatus } from './run-store';

export interface SaveAsWorkflowFormProps {
  readonly saveWorkflowStatus: SaveWorkflowStatus;
  readonly onSave: (name: string) => void;
}

/**
 * Lets a user turn a just-completed run into a reusable `@aegis/workflows` `Workflow`
 * (#121) — the "record" half of Phase 3's own promise, closing a gap left open since
 * #109 (`docs/adr/0043-run-recorder.md` deferred this to "whichever later issue wires a
 * 'Save as workflow' UI action"; #118/#119's options-page UI only ever managed workflows
 * that already existed). Only rendered when the run manager reports a completed
 * (`status: 'done'`) run — see `App.tsx`.
 */
export function SaveAsWorkflowForm({
  saveWorkflowStatus,
  onSave,
}: SaveAsWorkflowFormProps): React.JSX.Element {
  const [name, setName] = useState('');

  if (saveWorkflowStatus.status === 'saved') {
    return (
      <p className="text-sm text-green-700">
        Saved as a workflow — find it in Options → Workflows.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <label className="block text-xs text-muted-foreground">
        Save this run as a workflow
        <input
          className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
          placeholder="Workflow name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={saveWorkflowStatus.status === 'saving' || name.trim().length === 0}
        onClick={() => {
          onSave(name);
        }}
      >
        {saveWorkflowStatus.status === 'saving' ? 'Saving…' : 'Save as workflow'}
      </Button>
      {saveWorkflowStatus.status === 'error' ? (
        <p className="text-xs text-red-600">{saveWorkflowStatus.message}</p>
      ) : null}
    </div>
  );
}

import type { RunPolicyDraft } from './workflow-run-policy-draft';

export interface WorkflowRunPolicyEditorProps {
  readonly draft: RunPolicyDraft;
  readonly onChange: (draft: RunPolicyDraft) => void;
}

/**
 * Edits a workflow's `RunPolicy` (#119) — what it may do unattended, with no human
 * watching (#117). Operates on the raw {@link RunPolicyDraft} text directly, not a
 * round-tripped `RunPolicy`: converting the comma-list/numeric fields back to their
 * canonical form on every keystroke (trimming, dropping empties) would fight the user
 * mid-edit — e.g. a trailing ", " while typing a second tool id would vanish before they
 * could type the next character. `WorkflowBuilderPanel` converts once, at Save.
 */
export function WorkflowRunPolicyEditor({
  draft,
  onChange,
}: WorkflowRunPolicyEditorProps): React.JSX.Element {
  return (
    <div className="space-y-2 text-xs">
      <label className="block text-muted-foreground">
        Allowed tool ids (comma-separated)
        <input
          className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
          value={draft.allowedToolIds}
          onChange={(event) => {
            onChange({ ...draft, allowedToolIds: event.target.value });
          }}
        />
      </label>
      <label className="block text-muted-foreground">
        Allowed origins (comma-separated)
        <input
          className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
          value={draft.allowedOrigins}
          onChange={(event) => {
            onChange({ ...draft, allowedOrigins: event.target.value });
          }}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.allowStateChanging}
          onChange={(event) => {
            onChange({ ...draft, allowStateChanging: event.target.checked });
          }}
        />
        Allow state-changing steps unattended
      </label>
      <label className="block text-muted-foreground">
        Max steps per run (blank = no limit)
        <input
          className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
          value={draft.maxStepsPerRun}
          onChange={(event) => {
            onChange({ ...draft, maxStepsPerRun: event.target.value });
          }}
        />
      </label>
      <label className="block text-muted-foreground">
        Max runs per day (blank = no limit)
        <input
          className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
          value={draft.maxRunsPerDay}
          onChange={(event) => {
            onChange({ ...draft, maxRunsPerDay: event.target.value });
          }}
        />
      </label>
    </div>
  );
}

import type {
  Workflow,
  WorkflowId,
  WorkflowRunRecord,
  WorkflowRunStore,
  WorkflowStepResult,
  WorkflowStore,
} from '@aegis/workflows';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

import { draftFromWorkflow, toWorkflowEdits, type WorkflowEditDraft } from './workflow-edit-draft';
import { WorkflowRunTrace } from './workflow-run-trace';
import type { WorkflowRunTrigger } from './workflow-run-trigger';

export interface WorkflowLibraryPanelProps {
  readonly workflowStore: WorkflowStore;
  readonly runStore: WorkflowRunStore;
  readonly runTrigger: WorkflowRunTrigger;
}

type Section = 'run' | 'history' | 'edit';
type RunStatus =
  | { readonly status: 'idle' }
  | { readonly status: 'starting' }
  | { readonly status: 'started'; readonly runId: string }
  | { readonly status: 'error'; readonly message: string };
type SaveStatus =
  { readonly status: 'idle' } | { readonly status: 'error'; readonly message: string };

function valueParams(
  workflow: Workflow,
): readonly Extract<Workflow['params'][number], { kind: 'value' }>[] {
  return workflow.params.filter(
    (param): param is Extract<Workflow['params'][number], { kind: 'value' }> =>
      param.kind === 'value',
  );
}

const STATUS_LABEL: Record<WorkflowRunRecord['status'], string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  needs_confirmation: 'Needs confirmation',
  hard_stopped: 'Blocked',
  aborted: 'Aborted',
};

/**
 * Lists saved workflows and lets a user run one with its own params, edit its name and
 * param defaults (editing recorded steps is #119's job), view its run history, and
 * delete it (#118). Every read/write goes straight to `@aegis/workflows`' stores, exactly
 * like every other options panel (`docs/adr/0037-mcp-tools-management-ui.md`) — the one
 * exception is starting a run, which only the background service worker can actually do
 * (`WorkflowLibraryPanelProps.runTrigger`, a thin request/response wrapper over a new
 * message port, since nothing in the options page could previously reach into the
 * background at all).
 */
export function WorkflowLibraryPanel({
  workflowStore,
  runStore,
  runTrigger,
}: WorkflowLibraryPanelProps): React.JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const [workflows, setWorkflows] = useState<readonly Workflow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, Section | undefined>>({});
  const [runValues, setRunValues] = useState<Record<string, Record<string, string>>>({});
  const [runStatus, setRunStatus] = useState<Record<string, RunStatus>>({});
  const [histories, setHistories] = useState<Record<string, readonly WorkflowRunRecord[]>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, WorkflowEditDraft>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});

  async function refreshWorkflows(): Promise<void> {
    const result = await workflowStore.listWorkflows();
    if (result.ok) {
      setWorkflows([...result.value].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  useEffect(() => {
    workflowStore
      .listWorkflows()
      .then((result) => {
        if (result.ok) {
          setWorkflows([...result.value].sort((a, b) => a.name.localeCompare(b.name)));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setLoaded(true);
      });
  }, [workflowStore]);

  if (!loaded) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  function toggleSection(workflowId: WorkflowId, section: Section): void {
    setExpanded((current) => ({
      ...current,
      [workflowId]: current[workflowId] === section ? undefined : section,
    }));
    if (section === 'edit') {
      const workflow = workflows.find((entry) => entry.id === workflowId);
      if (workflow !== undefined) {
        setEditDrafts((current) => ({ ...current, [workflowId]: draftFromWorkflow(workflow) }));
      }
    }
    if (section === 'history') {
      void loadHistory(workflowId);
    }
  }

  async function loadHistory(workflowId: WorkflowId): Promise<void> {
    const result = await runStore.listRunsForWorkflow(workflowId);
    if (result.ok) {
      setHistories((current) => ({ ...current, [workflowId]: result.value }));
    }
  }

  async function handleRun(workflow: Workflow): Promise<void> {
    setRunStatus((current) => ({ ...current, [workflow.id]: { status: 'starting' } }));
    const values = runValues[workflow.id] ?? {};
    const result = await runTrigger.triggerRun(workflow.id, values);
    setRunStatus((current) => ({
      ...current,
      [workflow.id]: result.ok
        ? { status: 'started', runId: result.value.runId }
        : { status: 'error', message: result.error.message },
    }));
  }

  async function handleDelete(workflow: Workflow): Promise<void> {
    const result = await workflowStore.removeWorkflow(workflow.id);
    if (result.ok) {
      await refreshWorkflows();
    }
  }

  async function handleSaveEdit(workflow: Workflow): Promise<void> {
    const draft = editDrafts[workflow.id];
    if (draft === undefined) {
      return;
    }
    const edits = toWorkflowEdits(draft, workflow);
    if (edits === undefined) {
      setSaveStatus((current) => ({
        ...current,
        [workflow.id]: { status: 'error', message: 'Enter a name.' },
      }));
      return;
    }
    const result = await workflowStore.updateWorkflow(workflow.id, edits);
    if (result.ok) {
      setSaveStatus((current) => ({ ...current, [workflow.id]: { status: 'idle' } }));
      setExpanded((current) => ({ ...current, [workflow.id]: undefined }));
      await refreshWorkflows();
    } else {
      setSaveStatus((current) => ({
        ...current,
        [workflow.id]: { status: 'error', message: result.error.message },
      }));
    }
  }

  if (workflows.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Workflows</h2>
        <p className="text-sm text-muted-foreground">
          No workflows recorded yet. Record a run in the side panel, then save it as a workflow to
          see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Workflows</h2>
      <ul className="space-y-2">
        {workflows.map((workflow) => {
          const section = expanded[workflow.id];
          const status = runStatus[workflow.id] ?? { status: 'idle' };
          const history = histories[workflow.id] ?? [];
          const draft = editDrafts[workflow.id];
          const save = saveStatus[workflow.id] ?? { status: 'idle' };
          const params = valueParams(workflow);

          return (
            <li key={workflow.id} className="space-y-2 rounded-md border border-border p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {workflow.name}
                  <span className="ml-2 truncate text-xs font-normal text-muted-foreground">
                    {workflow.origin} · v{workflow.version}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={section === 'run'}
                  aria-controls={`run-${workflow.id}`}
                  onClick={() => {
                    toggleSection(workflow.id, 'run');
                  }}
                >
                  Run
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={section === 'history'}
                  aria-controls={`history-${workflow.id}`}
                  onClick={() => {
                    toggleSection(workflow.id, 'history');
                  }}
                >
                  History
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={section === 'edit'}
                  aria-controls={`edit-${workflow.id}`}
                  onClick={() => {
                    toggleSection(workflow.id, 'edit');
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDelete(workflow)}
                >
                  Delete
                </Button>
              </div>

              {section === 'run' ? (
                <div
                  id={`run-${workflow.id}`}
                  className="space-y-2 border-t border-border pt-2 text-sm"
                >
                  {params.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      This workflow takes no parameters.
                    </p>
                  ) : (
                    params.map((param) => (
                      <label key={param.name} className="block text-xs text-muted-foreground">
                        {param.name}
                        {param.description !== undefined ? ` — ${param.description}` : ''}
                        <input
                          className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
                          placeholder={param.defaultValue ?? ''}
                          value={runValues[workflow.id]?.[param.name] ?? ''}
                          onChange={(event) => {
                            setRunValues((current) => ({
                              ...current,
                              [workflow.id]: {
                                ...current[workflow.id],
                                [param.name]: event.target.value,
                              },
                            }));
                          }}
                        />
                      </label>
                    ))
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={status.status === 'starting'}
                    onClick={() => void handleRun(workflow)}
                  >
                    {status.status === 'starting' ? 'Starting…' : 'Start run'}
                  </Button>
                  {status.status === 'started' ? (
                    <p className="text-xs text-muted-foreground">Run started ({status.runId}).</p>
                  ) : null}
                  {status.status === 'error' ? (
                    <p className="text-xs text-red-600">{status.message}</p>
                  ) : null}
                </div>
              ) : null}

              {section === 'history' ? (
                <div
                  id={`history-${workflow.id}`}
                  className="space-y-2 border-t border-border pt-2 text-sm"
                >
                  {history.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No runs yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {history.map((record) => (
                        <li key={record.id} className="rounded bg-muted p-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{STATUS_LABEL[record.status]}</span>
                            <span className="text-muted-foreground">
                              {new Date(record.startedAt).toLocaleString()}
                            </span>
                          </div>
                          {record.reason !== undefined ? (
                            <p className="text-muted-foreground">{record.reason}</p>
                          ) : null}
                          <WorkflowRunTrace steps={record.stepResults as WorkflowStepResult[]} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {section === 'edit' && draft !== undefined ? (
                <div
                  id={`edit-${workflow.id}`}
                  className="space-y-2 border-t border-border pt-2 text-sm"
                >
                  <label className="block text-xs text-muted-foreground">
                    Name
                    <input
                      className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
                      value={draft.name}
                      onChange={(event) => {
                        setEditDrafts((current) => ({
                          ...current,
                          [workflow.id]: { ...draft, name: event.target.value },
                        }));
                      }}
                    />
                  </label>
                  {params.map((param) => (
                    <label key={param.name} className="block text-xs text-muted-foreground">
                      Default for {param.name}
                      <input
                        className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
                        value={draft.paramDefaults[param.name] ?? ''}
                        onChange={(event) => {
                          setEditDrafts((current) => ({
                            ...current,
                            [workflow.id]: {
                              ...draft,
                              paramDefaults: {
                                ...draft.paramDefaults,
                                [param.name]: event.target.value,
                              },
                            },
                          }));
                        }}
                      />
                    </label>
                  ))}
                  <Button type="button" size="sm" onClick={() => void handleSaveEdit(workflow)}>
                    Save
                  </Button>
                  {save.status === 'error' ? (
                    <p className="text-xs text-red-600">{save.message}</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

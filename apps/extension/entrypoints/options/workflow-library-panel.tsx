import type {
  Workflow,
  WorkflowId,
  WorkflowRunRecord,
  WorkflowRunStore,
  WorkflowScheduleStore,
  WorkflowStepResult,
  WorkflowStore,
} from '@aegis/workflows';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

import { WorkflowBuilderPanel } from './workflow-builder-panel';
import { WorkflowRunTrace } from './workflow-run-trace';
import type { WorkflowRunTrigger } from './workflow-run-trigger';

export interface WorkflowLibraryPanelProps {
  readonly workflowStore: WorkflowStore;
  readonly runStore: WorkflowRunStore;
  readonly scheduleStore: WorkflowScheduleStore;
  readonly runTrigger: WorkflowRunTrigger;
}

type Section = 'run' | 'history';
type RunStatus =
  | { readonly status: 'idle' }
  | { readonly status: 'starting' }
  | { readonly status: 'started'; readonly runId: string }
  | { readonly status: 'error'; readonly message: string };

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
 * Lists saved workflows and lets a user run one with its own params, view its run
 * history, and delete it (#118). "Edit" swaps the whole panel for `WorkflowBuilderPanel`
 * (#119) — a full inspect/edit surface (steps, params, `RunPolicy`, scheduling) too big
 * for an inline per-row section, superseding #118's own inline "name + param defaults
 * only" editor. Every read/write goes straight to `@aegis/workflows`' stores, exactly like
 * every other options panel (`docs/adr/0037-mcp-tools-management-ui.md`) — the one
 * exception is starting a run, which only the background service worker can actually do
 * (`WorkflowLibraryPanelProps.runTrigger`, a thin request/response wrapper over a new
 * message port, since nothing in the options page could previously reach into the
 * background at all).
 */
export function WorkflowLibraryPanel({
  workflowStore,
  runStore,
  scheduleStore,
  runTrigger,
}: WorkflowLibraryPanelProps): React.JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const [workflows, setWorkflows] = useState<readonly Workflow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, Section | undefined>>({});
  const [runValues, setRunValues] = useState<Record<string, Record<string, string>>>({});
  const [runStatus, setRunStatus] = useState<Record<string, RunStatus>>({});
  const [histories, setHistories] = useState<Record<string, readonly WorkflowRunRecord[]>>({});
  const [editingWorkflowId, setEditingWorkflowId] = useState<WorkflowId | undefined>(undefined);

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

  const editingWorkflow = workflows.find((entry) => entry.id === editingWorkflowId);
  if (editingWorkflow !== undefined) {
    return (
      <WorkflowBuilderPanel
        workflow={editingWorkflow}
        workflowStore={workflowStore}
        scheduleStore={scheduleStore}
        onClose={() => {
          setEditingWorkflowId(undefined);
          void refreshWorkflows();
        }}
      />
    );
  }

  function toggleSection(workflowId: WorkflowId, section: Section): void {
    setExpanded((current) => ({
      ...current,
      [workflowId]: current[workflowId] === section ? undefined : section,
    }));
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
                  onClick={() => {
                    setEditingWorkflowId(workflow.id);
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}

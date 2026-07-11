import type { Worker } from 'playwright';

const WORKFLOWS_STORAGE_KEY = 'workflows';
/** Must match `packages/workflows/src/schema/workflow.ts`'s `CURRENT_WORKFLOW_SCHEMA_VERSION`. */
const WORKFLOW_SCHEMA_VERSION = 1;

export interface WorkflowStepSeed {
  readonly stepId: string;
  readonly toolId: string;
  readonly args: unknown;
  readonly target?: {
    readonly selector?: string;
    readonly role?: string;
    readonly name?: string;
  };
  readonly expect?: { readonly type: string; readonly [key: string]: unknown };
}

export interface WorkflowSeed {
  readonly id: string;
  readonly name: string;
  readonly origin: string;
  readonly steps: readonly WorkflowStepSeed[];
  readonly authorization: {
    readonly allowedToolIds: readonly string[];
    readonly allowedOrigins: readonly string[];
    readonly allowStateChanging: boolean;
  };
}

/**
 * Seeds `chrome.storage.local` with one or more pre-built {@link WorkflowSeed}s (#120) —
 * directly through the background service worker's own `chrome.storage` access, bypassing
 * `@aegis/workflows`' `WorkflowStore` entirely, the same reason `seedModelRoutingConfig`/
 * `seedMcpServer` do (this runs from outside the extension's module graph). Storage key
 * and envelope shape must match `packages/workflows/src/store/workflow-store.ts`/
 * `store/workflow-envelope.ts` exactly. Seeds every workflow in one `chrome.storage.local`
 * write so a caller doesn't need to worry about merging with a previous call.
 */
export async function seedWorkflows(
  worker: Worker,
  workflows: readonly WorkflowSeed[],
): Promise<void> {
  const now = Date.now();
  const map = Object.fromEntries(
    workflows.map((workflow) => [
      workflow.id,
      {
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        workflow: {
          id: workflow.id,
          version: 0,
          name: workflow.name,
          origin: workflow.origin,
          params: [],
          steps: workflow.steps,
          authorization: workflow.authorization,
          createdAt: now,
          updatedAt: now,
        },
      },
    ]),
  );

  await worker.evaluate(([key, value]) => chrome.storage.local.set({ [key]: value }), [
    WORKFLOWS_STORAGE_KEY,
    map,
  ] as const);
}

export interface WorkflowRunRecordSnapshot {
  readonly id: string;
  readonly workflowId: string;
  readonly status: string;
  readonly stepResults: readonly unknown[];
  readonly reason?: string;
}

const RUNS_STORAGE_KEY = 'workflow-runs';

/** Reads every persisted `WorkflowRunRecord` directly from `chrome.storage.local` — the same "observe real state from outside the extension" convention `seedWorkflows` uses, so a caller can poll a background run's real outcome without depending on any UI ever rendering it. */
export async function readWorkflowRuns(
  worker: Worker,
): Promise<Readonly<Record<string, WorkflowRunRecordSnapshot>>> {
  const result = await worker.evaluate(
    (key): Promise<Record<string, unknown>> =>
      chrome.storage.local.get(key).then((stored: Record<string, unknown>) => {
        const value = stored[key];
        return typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)
          : {};
      }),
    RUNS_STORAGE_KEY,
  );
  return result as Record<string, WorkflowRunRecordSnapshot>;
}

/** Polls `readWorkflowRuns` until `predicate` is satisfied or `timeoutMs` elapses, returning the last-seen snapshot either way. */
export async function waitForWorkflowRuns(
  worker: Worker,
  predicate: (runs: Readonly<Record<string, WorkflowRunRecordSnapshot>>) => boolean,
  timeoutMs: number,
): Promise<Readonly<Record<string, WorkflowRunRecordSnapshot>>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const runs = await readWorkflowRuns(worker);
    if (predicate(runs) || Date.now() >= deadline) {
      return runs;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

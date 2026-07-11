import { createSecretVault } from '@aegis/security';
import type { StoragePort } from '@aegis/shared';
import { err, ok, type Result } from '@aegis/shared';
import {
  createRunConcurrencyLimiter,
  createWorkflowRunStore,
  createWorkflowStore,
  hasReachedDailyRunLimit,
  runWorkflowInBackground,
  toRunRecordId,
  type Workflow,
  type WorkflowId,
  type WorkflowRunRecord,
} from '@aegis/workflows';

import { buildLoopServices } from './build-loop-services';
import { closeManagedTab, openManagedTab } from './managed-tab';
import { notifyRunBlocked } from './notify';

export type BackgroundRunErrorCode =
  | 'WORKFLOW_NOT_FOUND'
  | 'CONCURRENCY_LIMIT_REACHED'
  | 'RATE_LIMIT_REACHED'
  | 'TAB_OPEN_FAILED'
  | 'STORAGE_FAILED';

/** Plain, non-`AegisError` shape — mirrors `build-loop-services.ts`'s own `BuildLoopServicesError`, the established convention for this composition-root layer's own errors (distinct from a domain package's `AegisError` subclasses). */
export interface BackgroundRunError {
  readonly code: BackgroundRunErrorCode;
  readonly message: string;
}

/**
 * Runs workflows entirely unattended (#115): drives a managed (non-active) tab so a run
 * never needs the side panel open or the user's foreground tab, checkpoints progress via
 * `@aegis/workflows`' `runWorkflowInBackground` so a service-worker eviction mid-run
 * loses at most the one step in flight, and caps how many runs proceed at once.
 */
export interface BackgroundRunManager {
  /** Starts a brand-new background run of `workflowId`. Fails outright (no tab opened, no run recorded) if already at the concurrency limit. */
  startBackgroundRun(
    workflowId: WorkflowId,
    values: Readonly<Record<string, string>>,
  ): Promise<Result<WorkflowRunRecord, BackgroundRunError>>;
  /** Resumes every run left `status: 'running'` when the service worker was last evicted, up to the concurrency limit. */
  initialize(): Promise<void>;
}

export function createBackgroundRunManager(
  /** `chrome.storage.local` in production — a run record must survive a browser restart, not just a service-worker eviction. */
  runStorage: StoragePort,
  /** `chrome.storage.local` in production — where `WorkflowStore`, model routing config, and the secret vault all live. */
  workflowStorage: StoragePort,
  maxConcurrentRuns: number,
  buildLoop: typeof buildLoopServices = buildLoopServices,
  openTab: typeof openManagedTab = openManagedTab,
  closeTab: typeof closeManagedTab = closeManagedTab,
  generateRunId: () => string = () => crypto.randomUUID(),
  notify: typeof notifyRunBlocked = notifyRunBlocked,
): BackgroundRunManager {
  const runStore = createWorkflowRunStore(runStorage);
  const workflowStore = createWorkflowStore(workflowStorage);
  const limiter = createRunConcurrencyLimiter(maxConcurrentRuns);

  async function drive(
    workflow: Workflow,
    runRecord: WorkflowRunRecord,
    tabId: number,
  ): Promise<void> {
    const builtResult = await buildLoop(workflowStorage, tabId);
    if (!builtResult.ok) {
      await runStore.updateRun(runRecord.id, {
        status: 'failed',
        reason: builtResult.error.message,
      });
      limiter.release();
      await closeTab(tabId);
      return;
    }

    const built = builtResult.value;
    const attachResult = await built.attach();
    if (!attachResult.ok) {
      await runStore.updateRun(runRecord.id, {
        status: 'failed',
        reason: `Could not attach to the managed tab: ${attachResult.error.message}`,
      });
      limiter.release();
      await closeTab(tabId);
      return;
    }

    // A fresh vault scoped to this call — the service worker has no way to share an
    // *unlocked* vault with the options page's own instance (separate processes,
    // `build-loop-services.ts`'s own MCP-secrets comment). A step needing a secret while
    // the vault is locked hard-stops the run (`resolveStepArgsSecrets`) rather than ever
    // sending the raw placeholder.
    const vault = createSecretVault(workflowStorage);

    const result = await runWorkflowInBackground(workflow, runRecord, runStore, workflowStore, {
      registry: built.toolRegistry,
      ctx: built.executorContext,
      session: built.executorContext.session,
      navigate: built.services.decide,
      vault,
    });
    if (result.ok && result.value.status === 'hard_stopped') {
      await notify(workflow.name, result.value.reason ?? "Blocked by the workflow's RunPolicy");
    }

    await built.detach();
    limiter.release();
    await closeTab(tabId);
  }

  async function startOn(
    workflow: Workflow,
    values: Readonly<Record<string, string>>,
  ): Promise<Result<WorkflowRunRecord, BackgroundRunError>> {
    if (!limiter.tryAcquire()) {
      return err({
        code: 'CONCURRENCY_LIMIT_REACHED',
        message: 'Too many background runs are already in progress',
      });
    }

    const history = await runStore.listRunsForWorkflow(workflow.id);
    const recentStartTimes = history.ok ? history.value.map((record) => record.startedAt) : [];
    if (hasReachedDailyRunLimit(workflow.authorization, recentStartTimes, Date.now())) {
      limiter.release();
      return err({
        code: 'RATE_LIMIT_REACHED',
        message: `Workflow "${workflow.name}" has already reached its maxRunsPerDay limit`,
      });
    }

    const openResult = await openTab(workflow.origin);
    if (!openResult.ok) {
      limiter.release();
      return err({ code: 'TAB_OPEN_FAILED', message: openResult.error.message });
    }

    const created = await runStore.createRun({
      id: toRunRecordId(generateRunId()),
      workflowId: workflow.id,
      values,
    });
    if (!created.ok) {
      limiter.release();
      await closeTab(openResult.value.tabId);
      return err({ code: 'STORAGE_FAILED', message: created.error.message });
    }

    const withTab = await runStore.updateRun(created.value.id, { tabId: openResult.value.tabId });
    const runRecord = withTab.ok ? withTab.value : created.value;

    void drive(workflow, runRecord, openResult.value.tabId);
    return ok(runRecord);
  }

  return {
    async startBackgroundRun(workflowId, values) {
      const workflowResult = await workflowStore.getWorkflow(workflowId);
      if (!workflowResult.ok) {
        return err({ code: 'STORAGE_FAILED', message: workflowResult.error.message });
      }
      if (workflowResult.value === undefined) {
        return err({
          code: 'WORKFLOW_NOT_FOUND',
          message: `Workflow "${workflowId}" does not exist`,
        });
      }
      return startOn(workflowResult.value, values);
    },

    async initialize() {
      const runningResult = await runStore.listRunningRuns();
      if (!runningResult.ok) {
        return;
      }

      for (const record of runningResult.value) {
        if (record.tabId === undefined) {
          await runStore.updateRun(record.id, {
            status: 'failed',
            reason: 'No managed tab was recorded for this run',
          });
          continue;
        }
        if (!limiter.tryAcquire()) {
          // Stays `running` — a later `initialize()` (or a future manual resume, #116)
          // picks it back up once a slot frees.
          continue;
        }

        const workflowResult = await workflowStore.getWorkflow(record.workflowId);
        if (!workflowResult.ok || workflowResult.value === undefined) {
          limiter.release();
          await runStore.updateRun(record.id, {
            status: 'failed',
            reason: 'The workflow no longer exists',
          });
          continue;
        }

        void drive(workflowResult.value, record, record.tabId);
      }
    },
  };
}

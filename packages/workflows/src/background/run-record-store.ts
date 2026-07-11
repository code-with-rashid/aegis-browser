import { err, ok, type Result, type StoragePort } from '@aegis/shared';
import { z } from 'zod';

import { WorkflowError } from '../errors';
import type { RunRecordId, WorkflowId } from '../ids';
import { WorkflowRunRecordSchema, type WorkflowRunRecord } from './run-record';

/** Everything needed to start tracking a brand-new background run — the store fills in `status: 'running'`, `nextStepIndex: 0`, `stepResults: []`, `startedAt`, and `updatedAt`. */
export interface NewRunRecordInput {
  readonly id: RunRecordId;
  readonly workflowId: WorkflowId;
  readonly values: Readonly<Record<string, string>>;
}

/** Fields a caller may revise on an existing run record — `id`/`workflowId`/`values`/`startedAt` are set once at creation and never patched. */
export type RunRecordPatch = Partial<
  Pick<WorkflowRunRecord, 'status' | 'nextStepIndex' | 'stepResults' | 'reason' | 'tabId'>
>;

/**
 * Persisted `WorkflowRunRecord` CRUD, backed by a {@link StoragePort} — mirrors
 * `WorkflowStore`'s map-of-everything-under-one-key shape
 * (`docs/adr/0042-workflow-data-model-storage.md`), keyed by `RunRecordId` instead of
 * `WorkflowId`.
 */
export interface WorkflowRunStore {
  createRun(input: NewRunRecordInput): Promise<Result<WorkflowRunRecord, WorkflowError>>;
  getRun(id: RunRecordId): Promise<Result<WorkflowRunRecord | undefined, WorkflowError>>;
  /** Applies `patch`, bumping `updatedAt`. Fails with `RUN_RECORD_NOT_FOUND` if the record doesn't exist. */
  updateRun(
    id: RunRecordId,
    patch: RunRecordPatch,
  ): Promise<Result<WorkflowRunRecord, WorkflowError>>;
  listRuns(): Promise<Result<readonly WorkflowRunRecord[], WorkflowError>>;
  /** Every record still `status: 'running'` — what a restarted service worker must resume (#115). */
  listRunningRuns(): Promise<Result<readonly WorkflowRunRecord[], WorkflowError>>;
}

const RUNS_KEY = 'workflow-runs';
const RunRecordMapSchema = z.record(z.string(), WorkflowRunRecordSchema);
type RunRecordMap = z.infer<typeof RunRecordMapSchema>;

async function readMap(storage: StoragePort): Promise<Result<RunRecordMap, WorkflowError>> {
  const result = await storage.get(RunRecordMapSchema, RUNS_KEY);
  if (!result.ok) {
    return err(
      new WorkflowError('STORAGE_FAILED', 'Failed to read run records', { cause: result.error }),
    );
  }
  return ok(result.value ?? {});
}

async function writeMap(
  storage: StoragePort,
  map: RunRecordMap,
): Promise<Result<void, WorkflowError>> {
  const result = await storage.set(RunRecordMapSchema, RUNS_KEY, map);
  if (!result.ok) {
    return err(
      new WorkflowError('STORAGE_FAILED', 'Failed to save run records', { cause: result.error }),
    );
  }
  return ok(undefined);
}

export function createWorkflowRunStore(storage: StoragePort): WorkflowRunStore {
  return {
    async createRun(input) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }

      const now = Date.now();
      const record: WorkflowRunRecord = {
        id: input.id,
        workflowId: input.workflowId,
        status: 'running',
        values: input.values,
        nextStepIndex: 0,
        stepResults: [],
        startedAt: now,
        updatedAt: now,
      };
      const nextMap: RunRecordMap = { ...mapResult.value, [input.id]: record };
      const writeResult = await writeMap(storage, nextMap);
      if (!writeResult.ok) {
        return writeResult;
      }
      return ok(record);
    },

    async getRun(id) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      return ok(mapResult.value[id]);
    },

    async updateRun(id, patch) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      const current = mapResult.value[id];
      if (current === undefined) {
        return err(new WorkflowError('RUN_RECORD_NOT_FOUND', `Run record "${id}" does not exist`));
      }

      const updated: WorkflowRunRecord = { ...current, ...patch, updatedAt: Date.now() };
      const nextMap: RunRecordMap = { ...mapResult.value, [id]: updated };
      const writeResult = await writeMap(storage, nextMap);
      if (!writeResult.ok) {
        return writeResult;
      }
      return ok(updated);
    },

    async listRuns() {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      return ok(Object.values(mapResult.value));
    },

    async listRunningRuns() {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      return ok(Object.values(mapResult.value).filter((record) => record.status === 'running'));
    },
  };
}

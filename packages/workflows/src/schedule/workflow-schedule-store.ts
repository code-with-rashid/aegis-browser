import { err, ok, type Result, type StoragePort } from '@aegis/shared';
import { z } from 'zod';

import { WorkflowError } from '../errors';
import type { WorkflowId } from '../ids';
import {
  WorkflowScheduleSchema,
  type ScheduleTrigger,
  type WorkflowSchedule,
} from './workflow-schedule';

/** Everything needed to set a workflow's schedule — the store fills in `createdAt`/`updatedAt`, and `lastRunAt` starts unset. */
export interface UpsertScheduleInput {
  readonly workflowId: WorkflowId;
  readonly enabled: boolean;
  readonly trigger: ScheduleTrigger;
  readonly values?: Readonly<Record<string, string>>;
}

/** Fields a caller may revise on an existing schedule — `workflowId`/`createdAt` are set once and never patched. */
export type SchedulePatch = Partial<
  Pick<WorkflowSchedule, 'enabled' | 'trigger' | 'values' | 'lastRunAt'>
>;

/**
 * Persisted `WorkflowSchedule` CRUD, backed by a {@link StoragePort} — at most one
 * schedule per `WorkflowId`, so `upsertSchedule` creates or fully replaces rather than
 * failing on an already-existing one (unlike `WorkflowStore.createWorkflow`, where two
 * distinct workflows sharing an id is a real mistake to catch).
 */
export interface WorkflowScheduleStore {
  getSchedule(workflowId: WorkflowId): Promise<Result<WorkflowSchedule | undefined, WorkflowError>>;
  upsertSchedule(input: UpsertScheduleInput): Promise<Result<WorkflowSchedule, WorkflowError>>;
  /** Applies `patch`, bumping `updatedAt`. Fails with `WORKFLOW_NOT_FOUND` if no schedule exists yet for this workflow. */
  updateSchedule(
    workflowId: WorkflowId,
    patch: SchedulePatch,
  ): Promise<Result<WorkflowSchedule, WorkflowError>>;
  /** A no-op (not an error) if no schedule exists for this workflow. */
  removeSchedule(workflowId: WorkflowId): Promise<Result<void, WorkflowError>>;
  listSchedules(): Promise<Result<readonly WorkflowSchedule[], WorkflowError>>;
}

const SCHEDULES_KEY = 'workflow-schedules';
const ScheduleMapSchema = z.record(z.string(), WorkflowScheduleSchema);
type ScheduleMap = z.infer<typeof ScheduleMapSchema>;

async function readMap(storage: StoragePort): Promise<Result<ScheduleMap, WorkflowError>> {
  const result = await storage.get(ScheduleMapSchema, SCHEDULES_KEY);
  if (!result.ok) {
    return err(
      new WorkflowError('STORAGE_FAILED', 'Failed to read workflow schedules', {
        cause: result.error,
      }),
    );
  }
  return ok(result.value ?? {});
}

async function writeMap(
  storage: StoragePort,
  map: ScheduleMap,
): Promise<Result<void, WorkflowError>> {
  const result = await storage.set(ScheduleMapSchema, SCHEDULES_KEY, map);
  if (!result.ok) {
    return err(
      new WorkflowError('STORAGE_FAILED', 'Failed to save workflow schedules', {
        cause: result.error,
      }),
    );
  }
  return ok(undefined);
}

export function createWorkflowScheduleStore(storage: StoragePort): WorkflowScheduleStore {
  return {
    async getSchedule(workflowId) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      return ok(mapResult.value[workflowId]);
    },

    async upsertSchedule(input) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }

      const now = Date.now();
      const existing = mapResult.value[input.workflowId];
      const schedule: WorkflowSchedule = {
        workflowId: input.workflowId,
        enabled: input.enabled,
        trigger: input.trigger,
        values: input.values ?? {},
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const nextMap: ScheduleMap = { ...mapResult.value, [input.workflowId]: schedule };
      const writeResult = await writeMap(storage, nextMap);
      if (!writeResult.ok) {
        return writeResult;
      }
      return ok(schedule);
    },

    async updateSchedule(workflowId, patch) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      const current = mapResult.value[workflowId];
      if (current === undefined) {
        return err(
          new WorkflowError(
            'WORKFLOW_NOT_FOUND',
            `No schedule exists for workflow "${workflowId}"`,
          ),
        );
      }

      const updated: WorkflowSchedule = { ...current, ...patch, updatedAt: Date.now() };
      const nextMap: ScheduleMap = { ...mapResult.value, [workflowId]: updated };
      const writeResult = await writeMap(storage, nextMap);
      if (!writeResult.ok) {
        return writeResult;
      }
      return ok(updated);
    },

    async removeSchedule(workflowId) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      if (!(workflowId in mapResult.value)) {
        return ok(undefined);
      }
      const nextMap = Object.fromEntries(
        Object.entries(mapResult.value).filter(([key]) => key !== workflowId),
      );
      return writeMap(storage, nextMap);
    },

    async listSchedules() {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      return ok(Object.values(mapResult.value));
    },
  };
}

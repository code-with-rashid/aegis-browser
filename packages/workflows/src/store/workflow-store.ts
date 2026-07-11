import { err, ok, type Result, type StoragePort } from '@aegis/shared';

import { WorkflowError } from '../errors';
import type { WorkflowId } from '../ids';
import { migrateToVersion } from '../migration/migrate';
import { WORKFLOW_MIGRATIONS } from '../migration/workflow-migrations';
import { CURRENT_WORKFLOW_SCHEMA_VERSION, WorkflowSchema, type Workflow } from '../schema';
import {
  WorkflowEnvelopeMapSchema,
  type WorkflowEnvelope,
  type WorkflowEnvelopeMap,
} from './workflow-envelope';

const WORKFLOWS_KEY = 'workflows';

/** Everything needed to create a brand-new workflow — the store fills in `version` (starts at 0), `createdAt`, and `updatedAt`. */
export interface NewWorkflowInput {
  readonly id: WorkflowId;
  readonly name: string;
  readonly origin: string;
  readonly params?: Workflow['params'];
  readonly steps: Workflow['steps'];
  readonly authorization: Workflow['authorization'];
}

/** Fields a caller may revise on an existing workflow — `id`/`version`/`createdAt` are store-managed, never patchable directly. */
export type WorkflowPatch = Partial<Pick<Workflow, 'name' | 'params' | 'steps' | 'authorization'>>;

/**
 * Persisted `Workflow` CRUD, backed by a {@link StoragePort} — the storage layer #109's
 * recorder, #111's executor, and #113's self-heal all build on. Every read migrates the
 * persisted envelope forward and re-validates against the current `WorkflowSchema`
 * (`docs/adr/0042-workflow-data-model-storage.md`), so a caller only ever sees a
 * current-shape `Workflow`, never a stale one.
 */
export interface WorkflowStore {
  getWorkflow(id: WorkflowId): Promise<Result<Workflow | undefined, WorkflowError>>;
  /** Fails with `WORKFLOW_ALREADY_EXISTS` if `input.id` is already in use. */
  createWorkflow(input: NewWorkflowInput): Promise<Result<Workflow, WorkflowError>>;
  /** Applies `patch`, bumping `version` and `updatedAt`. Fails with `WORKFLOW_NOT_FOUND` if the workflow doesn't exist. */
  updateWorkflow(id: WorkflowId, patch: WorkflowPatch): Promise<Result<Workflow, WorkflowError>>;
  /** A no-op (not an error) if the workflow doesn't exist — removing something already gone still succeeds. */
  removeWorkflow(id: WorkflowId): Promise<Result<void, WorkflowError>>;
  listWorkflows(): Promise<Result<readonly Workflow[], WorkflowError>>;
}

async function readMap(storage: StoragePort): Promise<Result<WorkflowEnvelopeMap, WorkflowError>> {
  const result = await storage.get(WorkflowEnvelopeMapSchema, WORKFLOWS_KEY);
  if (!result.ok) {
    return err(
      new WorkflowError('STORAGE_FAILED', 'Failed to read workflows', { cause: result.error }),
    );
  }
  return ok(result.value ?? {});
}

async function writeMap(
  storage: StoragePort,
  map: WorkflowEnvelopeMap,
): Promise<Result<void, WorkflowError>> {
  const result = await storage.set(WorkflowEnvelopeMapSchema, WORKFLOWS_KEY, map);
  if (!result.ok) {
    return err(
      new WorkflowError('STORAGE_FAILED', 'Failed to save workflows', { cause: result.error }),
    );
  }
  return ok(undefined);
}

function toEnvelope(workflow: Workflow): WorkflowEnvelope {
  return { schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION, workflow };
}

function decodeEnvelope(envelope: WorkflowEnvelope): Result<Workflow, WorkflowError> {
  const migrated = migrateToVersion(
    envelope.workflow,
    envelope.schemaVersion,
    CURRENT_WORKFLOW_SCHEMA_VERSION,
    WORKFLOW_MIGRATIONS,
  );
  const parsed = WorkflowSchema.safeParse(migrated);
  if (!parsed.success) {
    return err(
      new WorkflowError('STORAGE_FAILED', 'Persisted workflow failed validation', {
        cause: parsed.error,
      }),
    );
  }
  return ok(parsed.data);
}

export function createWorkflowStore(storage: StoragePort): WorkflowStore {
  return {
    async getWorkflow(id) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      const envelope = mapResult.value[id];
      if (envelope === undefined) {
        return ok(undefined);
      }
      return decodeEnvelope(envelope);
    },

    async createWorkflow(input) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      if (input.id in mapResult.value) {
        return err(
          new WorkflowError('WORKFLOW_ALREADY_EXISTS', `Workflow "${input.id}" already exists`),
        );
      }

      const now = Date.now();
      const workflow: Workflow = {
        id: input.id,
        version: 0,
        name: input.name,
        origin: input.origin,
        params: input.params ?? [],
        steps: input.steps,
        authorization: input.authorization,
        createdAt: now,
        updatedAt: now,
      };
      const nextMap: WorkflowEnvelopeMap = { ...mapResult.value, [input.id]: toEnvelope(workflow) };
      const writeResult = await writeMap(storage, nextMap);
      if (!writeResult.ok) {
        return writeResult;
      }
      return ok(workflow);
    },

    async updateWorkflow(id, patch) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      const envelope = mapResult.value[id];
      if (envelope === undefined) {
        return err(new WorkflowError('WORKFLOW_NOT_FOUND', `Workflow "${id}" does not exist`));
      }
      const currentResult = decodeEnvelope(envelope);
      if (!currentResult.ok) {
        return currentResult;
      }

      const updated: Workflow = {
        ...currentResult.value,
        ...patch,
        version: currentResult.value.version + 1,
        updatedAt: Date.now(),
      };
      const nextMap: WorkflowEnvelopeMap = { ...mapResult.value, [id]: toEnvelope(updated) };
      const writeResult = await writeMap(storage, nextMap);
      if (!writeResult.ok) {
        return writeResult;
      }
      return ok(updated);
    },

    async removeWorkflow(id) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      if (!(id in mapResult.value)) {
        return ok(undefined);
      }
      const nextMap = Object.fromEntries(
        Object.entries(mapResult.value).filter(([key]) => key !== id),
      );
      return writeMap(storage, nextMap);
    },

    async listWorkflows() {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      const decoded: Workflow[] = [];
      for (const envelope of Object.values(mapResult.value)) {
        const result = decodeEnvelope(envelope);
        if (!result.ok) {
          return result;
        }
        decoded.push(result.value);
      }
      return ok(decoded);
    },
  };
}

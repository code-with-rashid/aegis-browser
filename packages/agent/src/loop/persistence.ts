import { isErr, ok, type Result, type StorageError, type StoragePort } from '@aegis/shared';
import { z } from 'zod';

const SNAPSHOT_KEY = 'agent-loop-snapshot';

const PersistedAgentLoopSnapshotSchema = z.object({
  snapshot: z.unknown(),
  persistedAt: z.number(),
});

/** The subset of an XState `Actor` this module needs — kept minimal so it's easy to mock. */
export interface PersistableActor {
  subscribe(listener: () => void): { unsubscribe(): void };
  getPersistedSnapshot(): unknown;
}

/**
 * Persists `actor`'s snapshot to `storage` on every transition (`docs/DESIGN.md` §5.1:
 * "loop state is persisted to `chrome.storage.session` after every transition"). Returns
 * an unsubscribe function. Storage is generic (`StoragePort`) so tests can use the
 * in-memory adapter; production wires this to `chrome.storage.session`.
 */
export function persistAgentLoopOnTransition(
  actor: PersistableActor,
  storage: StoragePort,
): () => void {
  const subscription = actor.subscribe(() => {
    void storage.set(PersistedAgentLoopSnapshotSchema, SNAPSHOT_KEY, {
      snapshot: actor.getPersistedSnapshot(),
      persistedAt: Date.now(),
    });
  });
  return () => {
    subscription.unsubscribe();
  };
}

/** Reads back the last-persisted snapshot, if any — pass the result to `createActor(machine, { snapshot })`. */
export async function hydrateAgentLoopSnapshot(
  storage: StoragePort,
): Promise<Result<unknown, StorageError>> {
  const result = await storage.get(PersistedAgentLoopSnapshotSchema, SNAPSHOT_KEY);
  if (isErr(result)) {
    return result;
  }
  return ok(result.value?.snapshot);
}

/** Clears the persisted snapshot — call once a run reaches a final state. */
export async function clearAgentLoopSnapshot(
  storage: StoragePort,
): Promise<Result<void, StorageError>> {
  return storage.remove(SNAPSHOT_KEY);
}

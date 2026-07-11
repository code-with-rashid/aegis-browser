/**
 * One migration step: upgrades a persisted document from exactly `fromVersion` to
 * `fromVersion + 1`. Each migration only ever steps forward by one version — chaining
 * several single-step migrations is simpler to write, test, and reason about than one
 * migration that jumps straight from an old version to the current one.
 */
export interface Migration {
  readonly fromVersion: number;
  migrate(data: unknown): unknown;
}

/**
 * Runs every migration needed to bring `data` from `fromVersion` up to `targetVersion`,
 * one version at a time. No-op (`data` returned unchanged) when `fromVersion` already
 * equals `targetVersion` — the common case, since most reads hit already-current data.
 *
 * There are no real `Migration`s registered anywhere yet (`WorkflowSchema` has only ever
 * had one shape, version 1) — this exists so a future schema change has a tested
 * mechanism to slot into, not a design invented and abandoned the day it's needed
 * (`docs/adr/0042-workflow-data-model-storage.md`).
 */
export function migrateToVersion(
  data: unknown,
  fromVersion: number,
  targetVersion: number,
  migrations: readonly Migration[],
): unknown {
  let current = data;
  let version = fromVersion;

  while (version < targetVersion) {
    const migration = migrations.find((candidate) => candidate.fromVersion === version);
    if (migration === undefined) {
      throw new Error(
        `No migration registered from schema version ${version} (target ${targetVersion})`,
      );
    }
    current = migration.migrate(current);
    version += 1;
  }

  return current;
}

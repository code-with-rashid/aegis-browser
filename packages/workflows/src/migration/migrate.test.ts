import { describe, expect, it } from 'vitest';

import { migrateToVersion, type Migration } from './migrate';

describe('migrateToVersion', () => {
  it('returns the data unchanged when already at the target version', () => {
    const data = { name: 'unchanged' };
    expect(migrateToVersion(data, 1, 1, [])).toBe(data);
  });

  it('applies a single migration to step forward one version', () => {
    const migrations: Migration[] = [
      {
        fromVersion: 1,
        migrate: (data) => ({ ...(data as Record<string, unknown>), migratedTo: 2 }),
      },
    ];

    const result = migrateToVersion({ name: 'v1 doc' }, 1, 2, migrations);

    expect(result).toEqual({ name: 'v1 doc', migratedTo: 2 });
  });

  it('chains multiple single-step migrations in order to reach a target several versions ahead', () => {
    const migrations: Migration[] = [
      { fromVersion: 1, migrate: (data) => ({ ...(data as Record<string, unknown>), step: 1 }) },
      { fromVersion: 2, migrate: (data) => ({ ...(data as Record<string, unknown>), step: 2 }) },
      { fromVersion: 3, migrate: (data) => ({ ...(data as Record<string, unknown>), step: 3 }) },
    ];

    const result = migrateToVersion({}, 1, 4, migrations);

    expect(result).toEqual({ step: 3 });
  });

  it('throws when no migration is registered for the version actually encountered', () => {
    expect(() => migrateToVersion({}, 1, 2, [])).toThrow(
      'No migration registered from schema version 1 (target 2)',
    );
  });

  it('only ever applies each migration once, even across multiple version steps', () => {
    let callCount = 0;
    const migrations: Migration[] = [
      {
        fromVersion: 1,
        migrate: (data) => {
          callCount += 1;
          return data;
        },
      },
    ];

    migrateToVersion({}, 1, 2, migrations);

    expect(callCount).toBe(1);
  });
});

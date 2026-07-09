import type { Result, StorageError, StoragePort } from '@aegis/shared';
import { ok } from '@aegis/shared';

import { type SitePolicy, SitePolicyMapSchema, type SitePolicyMap } from './site-policy';

const POLICIES_KEY = 'site-policies';

/** Persisted per-origin {@link SitePolicy} records, backed by a {@link StoragePort}. */
export interface PolicyStore {
  getPolicy(origin: string): Promise<Result<SitePolicy | undefined, StorageError>>;
  setPolicy(policy: SitePolicy): Promise<Result<void, StorageError>>;
  removePolicy(origin: string): Promise<Result<void, StorageError>>;
  listPolicies(): Promise<Result<readonly SitePolicy[], StorageError>>;
}

async function readMap(storage: StoragePort): Promise<Result<SitePolicyMap, StorageError>> {
  const result = await storage.get(SitePolicyMapSchema, POLICIES_KEY);
  if (!result.ok) {
    return result;
  }
  return ok(result.value ?? {});
}

/**
 * A {@link PolicyStore} that keeps every origin's policy in a single storage record (one
 * `Record<origin, SitePolicy>`), consistent with how few origins a user typically
 * configures and avoiding a storage key per origin.
 */
export function createPolicyStore(storage: StoragePort): PolicyStore {
  return {
    async getPolicy(origin) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      return ok(mapResult.value[origin]);
    },

    async setPolicy(policy) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      const nextMap: SitePolicyMap = { ...mapResult.value, [policy.origin]: policy };
      return storage.set(SitePolicyMapSchema, POLICIES_KEY, nextMap);
    },

    async removePolicy(origin) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      if (!(origin in mapResult.value)) {
        return ok(undefined);
      }
      const nextMap = Object.fromEntries(
        Object.entries(mapResult.value).filter(([key]) => key !== origin),
      );
      return storage.set(SitePolicyMapSchema, POLICIES_KEY, nextMap);
    },

    async listPolicies() {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      return ok(Object.values(mapResult.value));
    },
  };
}

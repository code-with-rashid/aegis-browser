import type { Result, StorageError, StoragePort } from '@aegis/shared';
import { ok } from '@aegis/shared';

import {
  McpToolPolicyMapSchema,
  type McpToolPolicy,
  type McpToolPolicyMap,
} from './mcp-tool-policy';

const TOOL_POLICIES_KEY = 'mcp-tool-policies';

/** Persisted per-tool {@link McpToolPolicy} records, keyed by `Tool.id`, backed by a {@link StoragePort}. */
export interface McpToolPolicyStore {
  getPolicy(toolId: string): Promise<Result<McpToolPolicy | undefined, StorageError>>;
  /** Upserts a policy — covers both "record a newly-discovered tool" and "the user changed their decision". */
  setPolicy(policy: McpToolPolicy): Promise<Result<void, StorageError>>;
  removePolicy(toolId: string): Promise<Result<void, StorageError>>;
  listPolicies(): Promise<Result<readonly McpToolPolicy[], StorageError>>;
}

async function readMap(storage: StoragePort): Promise<Result<McpToolPolicyMap, StorageError>> {
  const result = await storage.get(McpToolPolicyMapSchema, TOOL_POLICIES_KEY);
  if (!result.ok) {
    return result;
  }
  return ok(result.value ?? {});
}

/**
 * An {@link McpToolPolicyStore} that keeps every tool's policy in one storage record (one
 * `Record<toolId, McpToolPolicy>`) — the same shape `@aegis/security`'s `PolicyStore` uses
 * for per-origin policies and `@aegis/mcp`'s own `McpServerStore` uses for server configs.
 */
export function createMcpToolPolicyStore(storage: StoragePort): McpToolPolicyStore {
  return {
    async getPolicy(toolId) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      return ok(mapResult.value[toolId]);
    },

    async setPolicy(policy) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      const nextMap: McpToolPolicyMap = { ...mapResult.value, [policy.toolId]: policy };
      return storage.set(McpToolPolicyMapSchema, TOOL_POLICIES_KEY, nextMap);
    },

    async removePolicy(toolId) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      if (!(toolId in mapResult.value)) {
        return ok(undefined);
      }
      const nextMap = Object.fromEntries(
        Object.entries(mapResult.value).filter(([key]) => key !== toolId),
      );
      return storage.set(McpToolPolicyMapSchema, TOOL_POLICIES_KEY, nextMap);
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

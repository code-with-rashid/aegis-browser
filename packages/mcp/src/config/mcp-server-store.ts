import type { Result, StorageError, StoragePort } from '@aegis/shared';
import { ok } from '@aegis/shared';

import {
  McpServerConnectionConfigMapSchema,
  type McpServerConnectionConfig,
  type McpServerConnectionConfigMap,
} from './mcp-server-config';

const SERVERS_KEY = 'mcp-servers';

/** Persisted MCP server configs, keyed by `url`, backed by a {@link StoragePort}. */
export interface McpServerStore {
  getServer(url: string): Promise<Result<McpServerConnectionConfig | undefined, StorageError>>;
  /** Upserts a server config — covers both "add" and "edit" (the acceptance criteria's two operations are the same write). */
  saveServer(config: McpServerConnectionConfig): Promise<Result<void, StorageError>>;
  removeServer(url: string): Promise<Result<void, StorageError>>;
  listServers(): Promise<Result<readonly McpServerConnectionConfig[], StorageError>>;
}

async function readMap(
  storage: StoragePort,
): Promise<Result<McpServerConnectionConfigMap, StorageError>> {
  const result = await storage.get(McpServerConnectionConfigMapSchema, SERVERS_KEY);
  if (!result.ok) {
    return result;
  }
  return ok(result.value ?? {});
}

/**
 * An {@link McpServerStore} that keeps every server config in one storage record (one
 * `Record<url, McpServerConnectionConfig>`) — the same shape `@aegis/security`'s
 * `PolicyStore` uses for per-origin policies, appropriate here for the same reason: a
 * user configures few MCP servers, not enough to need a key-per-server.
 */
export function createMcpServerStore(storage: StoragePort): McpServerStore {
  return {
    async getServer(url) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      return ok(mapResult.value[url]);
    },

    async saveServer(config) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      const nextMap: McpServerConnectionConfigMap = { ...mapResult.value, [config.url]: config };
      return storage.set(McpServerConnectionConfigMapSchema, SERVERS_KEY, nextMap);
    },

    async removeServer(url) {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      if (!(url in mapResult.value)) {
        return ok(undefined);
      }
      const nextMap = Object.fromEntries(
        Object.entries(mapResult.value).filter(([key]) => key !== url),
      );
      return storage.set(McpServerConnectionConfigMapSchema, SERVERS_KEY, nextMap);
    },

    async listServers() {
      const mapResult = await readMap(storage);
      if (!mapResult.ok) {
        return mapResult;
      }
      return ok(Object.values(mapResult.value));
    },
  };
}

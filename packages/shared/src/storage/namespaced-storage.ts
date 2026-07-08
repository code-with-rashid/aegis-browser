import type { ZodType } from 'zod';

import type { Result } from '../result';
import type { StorageError, StoragePort } from './storage-port';

/**
 * Wraps a {@link StoragePort} so every key is prefixed with `namespace:`, letting
 * multiple packages share one underlying storage area without key collisions.
 */
export function createNamespacedStorage(port: StoragePort, namespace: string): StoragePort {
  const prefix = (key: string): string => `${namespace}:${key}`;

  return {
    get<T>(schema: ZodType<T>, key: string): Promise<Result<T | undefined, StorageError>> {
      return port.get(schema, prefix(key));
    },
    set<T>(schema: ZodType<T>, key: string, value: T): Promise<Result<void, StorageError>> {
      return port.set(schema, prefix(key), value);
    },
    remove(key: string): Promise<Result<void, StorageError>> {
      return port.remove(prefix(key));
    },
  };
}

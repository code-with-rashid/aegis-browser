import type { ZodType } from 'zod';

import { err, ok, type Result } from '../result';
import { StorageError, type StoragePort } from './storage-port';

/** An in-memory {@link StoragePort}, for tests and Storybook-style local development. */
export function createMemoryStorage(): StoragePort {
  const store = new Map<string, unknown>();

  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- interface is async everywhere else
    async get<T>(schema: ZodType<T>, key: string): Promise<Result<T | undefined, StorageError>> {
      if (!store.has(key)) {
        return ok(undefined);
      }

      const parsed = schema.safeParse(store.get(key));
      if (!parsed.success) {
        return err(
          new StorageError(
            'STORAGE_VALIDATION_FAILED',
            `Stored value for "${key}" failed validation: ${parsed.error.message}`,
            { cause: parsed.error },
          ),
        );
      }

      return ok(parsed.data);
    },

    // eslint-disable-next-line @typescript-eslint/require-await -- interface is async everywhere else
    async set<T>(schema: ZodType<T>, key: string, value: T): Promise<Result<void, StorageError>> {
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        return err(
          new StorageError(
            'STORAGE_VALIDATION_FAILED',
            `Value for "${key}" failed validation before write: ${parsed.error.message}`,
            { cause: parsed.error },
          ),
        );
      }

      store.set(key, parsed.data);
      return ok(undefined);
    },

    // eslint-disable-next-line @typescript-eslint/require-await -- interface is async everywhere else
    async remove(key: string): Promise<Result<void, StorageError>> {
      store.delete(key);
      return ok(undefined);
    },
  };
}

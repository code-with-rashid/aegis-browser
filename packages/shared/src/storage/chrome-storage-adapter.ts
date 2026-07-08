/// <reference types="chrome" />
import type { ZodType } from 'zod';

import { err, ok, type Result } from '../result';
import { StorageError, type StoragePort } from './storage-port';

/**
 * The only module in `@aegis/shared` allowed to reference `chrome.*`. Wraps a
 * `chrome.storage.StorageArea` (local, sync, or session) behind the Zod-validated
 * {@link StoragePort} interface.
 */
export function createChromeStorageAdapter(area: chrome.storage.StorageArea): StoragePort {
  return {
    async get<T>(schema: ZodType<T>, key: string): Promise<Result<T | undefined, StorageError>> {
      let raw: Record<string, unknown>;
      try {
        raw = await area.get(key);
      } catch (cause) {
        return err(new StorageError('STORAGE_READ_FAILED', `Failed to read "${key}"`, { cause }));
      }

      if (!(key in raw)) {
        return ok(undefined);
      }

      const parsed = schema.safeParse(raw[key]);
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

      try {
        await area.set({ [key]: parsed.data });
        return ok(undefined);
      } catch (cause) {
        return err(new StorageError('STORAGE_WRITE_FAILED', `Failed to write "${key}"`, { cause }));
      }
    },

    async remove(key: string): Promise<Result<void, StorageError>> {
      try {
        await area.remove(key);
        return ok(undefined);
      } catch (cause) {
        return err(
          new StorageError('STORAGE_REMOVE_FAILED', `Failed to remove "${key}"`, { cause }),
        );
      }
    },
  };
}

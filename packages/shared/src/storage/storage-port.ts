import type { ZodType } from 'zod';

import { AegisError } from '../errors';
import type { Result } from '../result';

/** Discriminates why a {@link StoragePort} operation failed. */
export type StorageErrorCode =
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'STORAGE_REMOVE_FAILED'
  | 'STORAGE_VALIDATION_FAILED';

/** Typed error raised by any {@link StoragePort} implementation. */
export class StorageError extends AegisError {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/**
 * A Zod-validated key/value storage port. Implementations must validate on both read
 * (data may have been written by an older schema version) and write (reject bad data
 * before it's persisted).
 */
export interface StoragePort {
  get<T>(schema: ZodType<T>, key: string): Promise<Result<T | undefined, StorageError>>;
  set<T>(schema: ZodType<T>, key: string, value: T): Promise<Result<void, StorageError>>;
  remove(key: string): Promise<Result<void, StorageError>>;
}

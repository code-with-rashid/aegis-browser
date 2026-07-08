export type { Ok, Err, Result } from './result';
export { ok, err, isOk, isErr, map, mapErr, andThen, unwrapOr, unwrap } from './result';

export { AegisError } from './errors';

export type { LogLevel, LogFields, Logger, LogSink } from './logger';
export { createLogger } from './logger';

export type { EventMap, EventHandler, EventBus } from './event-bus';
export { createEventBus } from './event-bus';

export type { Brand, TaskId, ElementRef } from './ids';
export { toTaskId, toElementRef } from './ids';

export type { AegisMessage } from './messages';

export type { StoragePort, StorageErrorCode } from './storage/storage-port';
export { StorageError } from './storage/storage-port';
export { createMemoryStorage } from './storage/memory-storage-adapter';
export { createNamespacedStorage } from './storage/namespaced-storage';
export { createChromeStorageAdapter } from './storage/chrome-storage-adapter';

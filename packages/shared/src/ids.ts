declare const brand: unique symbol;

/** A nominal type: `T` tagged with `Name` so distinct id kinds can't be mixed up. */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

/** Identifies a single agent run from start to completion. */
export type TaskId = Brand<string, 'TaskId'>;

/** Identifies a perceived page element with a stable reference across re-reads. */
export type ElementRef = Brand<string, 'ElementRef'>;

/** Brands a raw string as a {@link TaskId}. Callers are responsible for uniqueness. */
export function toTaskId(value: string): TaskId {
  return value as TaskId;
}

/** Brands a raw string as an {@link ElementRef}. Callers are responsible for uniqueness. */
export function toElementRef(value: string): ElementRef {
  return value as ElementRef;
}

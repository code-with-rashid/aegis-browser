/** A value that succeeded with `T`, carrying no error. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A value that failed with a typed error `E` instead of throwing. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * The result of a fallible operation: either {@link Ok} or {@link Err}. Use this instead
 * of throwing so failure paths are visible in function signatures and must be handled
 * explicitly by callers.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/** Wraps a success value as an {@link Ok}. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Wraps an error value as an {@link Err}. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Narrows a {@link Result} to {@link Ok}. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Narrows a {@link Result} to {@link Err}. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Transforms the success value of a {@link Result}, passing errors through unchanged. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Transforms the error value of a {@link Result}, passing successes through unchanged. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Chains a {@link Result}-returning function, short-circuiting on the first error. */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** Returns the success value, or `fallback` if the result is an {@link Err}. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Returns the success value, or throws the error. Reserved for call sites that have
 * already proven (or don't care about) the failure path — prefer {@link unwrapOr} or
 * explicit handling everywhere else.
 */
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

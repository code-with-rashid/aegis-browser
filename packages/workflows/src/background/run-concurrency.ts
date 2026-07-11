/**
 * Caps how many background runs may be in flight at once (#115's "concurrency limits"
 * scope item) — a plain in-memory counter, not persisted: a service-worker restart drops
 * every in-flight run's counted slot anyway (nothing is actually still running), so the
 * limiter simply starts fresh each time the worker starts, exactly as `activeCount` should.
 */
export interface RunConcurrencyLimiter {
  /** Reserves a slot and returns `true` if under the limit; returns `false` (reserving nothing) if at capacity. */
  tryAcquire(): boolean;
  /** Releases a previously-acquired slot. A no-op if nothing was reserved (never goes negative). */
  release(): void;
  readonly activeCount: number;
}

export function createRunConcurrencyLimiter(maxConcurrent: number): RunConcurrencyLimiter {
  let activeCount = 0;

  return {
    get activeCount() {
      return activeCount;
    },
    tryAcquire() {
      if (activeCount >= maxConcurrent) {
        return false;
      }
      activeCount += 1;
      return true;
    },
    release() {
      activeCount = Math.max(0, activeCount - 1);
    },
  };
}

import { describe, expect, it } from 'vitest';

import { createRunConcurrencyLimiter } from './run-concurrency';

describe('createRunConcurrencyLimiter', () => {
  it('acquires slots up to the limit, then rejects further attempts', () => {
    const limiter = createRunConcurrencyLimiter(2);

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    expect(limiter.activeCount).toBe(2);
  });

  it('releasing a slot allows a subsequent acquire to succeed again', () => {
    const limiter = createRunConcurrencyLimiter(1);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);

    limiter.release();

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.activeCount).toBe(1);
  });

  it('never goes negative when released more times than acquired', () => {
    const limiter = createRunConcurrencyLimiter(1);

    limiter.release();
    limiter.release();

    expect(limiter.activeCount).toBe(0);
    expect(limiter.tryAcquire()).toBe(true);
  });
});

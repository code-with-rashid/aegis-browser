import { describe, expect, it } from 'vitest';

import { AegisError } from './errors';

class FixtureError extends AegisError {
  readonly code = 'FIXTURE_FAILED' as const;
}

describe('AegisError', () => {
  it('sets the message and name from the concrete subclass', () => {
    const error = new FixtureError('something broke');
    expect(error.message).toBe('something broke');
    expect(error.name).toBe('FixtureError');
    expect(error.code).toBe('FIXTURE_FAILED');
    expect(error).toBeInstanceOf(Error);
  });

  it('preserves the cause option', () => {
    const cause = new Error('root cause');
    const error = new FixtureError('wrapped', { cause });
    expect(error.cause).toBe(cause);
  });
});

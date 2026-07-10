import { isErr, isOk } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { validateAction } from './validate-action';

describe('validateAction', () => {
  it('validates a well-formed built-in action with full typing', () => {
    const result = validateAction({ type: 'done', success: true, summary: 'ok' });
    expect(isOk(result) && result.value.type).toBe('done');
  });

  it('rejects an invalid action', () => {
    const result = validateAction({ type: 'done' });
    expect(isErr(result) && result.error.code).toBe('ACTION_INVALID_PARAMS');
  });

  it('rejects an action with an unknown type', () => {
    const result = validateAction({ type: 'teleport' });
    expect(isErr(result) && result.error.code).toBe('ACTION_INVALID_PARAMS');
  });
});

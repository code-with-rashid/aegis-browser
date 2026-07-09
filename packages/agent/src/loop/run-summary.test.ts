import { ActionExecutionError, type RunOutcome } from '@aegis/actions';
import { err, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { summarizeRunOutcome } from './run-summary';

describe('summarizeRunOutcome', () => {
  it('summarizes a completed run with only successes', () => {
    const outcome: RunOutcome = {
      kind: 'completed',
      results: [
        {
          action: { type: 'click', ref: toElementRef('ax:1') },
          attempt: 1,
          outcome: ok({ kind: 'click' }),
        },
        { action: { type: 'wait', ms: 5 }, attempt: 1, outcome: ok({ kind: 'wait' }) },
      ],
    };

    const summary = summarizeRunOutcome(outcome);

    expect(summary).toEqual({
      kind: 'completed',
      actions: [
        { type: 'click', succeeded: true },
        { type: 'wait', succeeded: true },
      ],
    });
  });

  it('extracts error code/message as plain strings for a failed action', () => {
    const outcome: RunOutcome = {
      kind: 'failed',
      failedAction: { type: 'navigate', url: 'https://example.com' },
      results: [
        {
          action: { type: 'navigate', url: 'https://example.com' },
          attempt: 3,
          outcome: err(new ActionExecutionError('CDP_SEND_FAILED', 'boom')),
        },
      ],
    };

    const summary = summarizeRunOutcome(outcome);

    expect(summary.kind).toBe('failed');
    expect(summary.actions).toEqual([
      { type: 'navigate', succeeded: false, errorCode: 'CDP_SEND_FAILED', errorMessage: 'boom' },
    ]);
  });

  it('produces no Error instances anywhere in the summary (JSON-safe)', () => {
    const outcome: RunOutcome = {
      kind: 'stalled',
      stalledOn: { type: 'click', ref: toElementRef('ax:1') },
      results: [
        {
          action: { type: 'click', ref: toElementRef('ax:1') },
          attempt: 1,
          outcome: err(new ActionExecutionError('ELEMENT_DETACHED', 'stale ref')),
        },
      ],
    };

    const summary = summarizeRunOutcome(outcome);

    expect(() => JSON.stringify(summary)).not.toThrow();
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });
});

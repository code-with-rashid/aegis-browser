import { ToolExecutionError } from '@aegis/actions';
import { err, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { summarizeRunOutcome } from './run-summary';
import type { ToolRunOutcome } from './services';

describe('summarizeRunOutcome', () => {
  it('summarizes a completed run with only successes', () => {
    const outcome: ToolRunOutcome = {
      kind: 'completed',
      results: [
        {
          toolCall: { toolId: 'browser.click', args: { type: 'click', ref: toElementRef('ax:1') } },
          attempt: 1,
          outcome: ok({ kind: 'click' }),
        },
        {
          toolCall: { toolId: 'browser.wait', args: { type: 'wait', ms: 5 } },
          attempt: 1,
          outcome: ok({ kind: 'wait' }),
        },
      ],
    };

    const summary = summarizeRunOutcome(outcome);

    expect(summary).toEqual({
      kind: 'completed',
      toolCalls: [
        { toolId: 'browser.click', succeeded: true },
        { toolId: 'browser.wait', succeeded: true },
      ],
    });
  });

  it('extracts error code/message as plain strings for a failed tool call', () => {
    const outcome: ToolRunOutcome = {
      kind: 'failed',
      failedToolCall: {
        toolId: 'browser.navigate',
        args: { type: 'navigate', url: 'https://example.com' },
      },
      results: [
        {
          toolCall: {
            toolId: 'browser.navigate',
            args: { type: 'navigate', url: 'https://example.com' },
          },
          attempt: 3,
          outcome: err(new ToolExecutionError('TOOL_EXECUTION_FAILED', 'boom')),
        },
      ],
    };

    const summary = summarizeRunOutcome(outcome);

    expect(summary.kind).toBe('failed');
    expect(summary.toolCalls).toEqual([
      {
        toolId: 'browser.navigate',
        succeeded: false,
        errorCode: 'TOOL_EXECUTION_FAILED',
        errorMessage: 'boom',
      },
    ]);
  });

  it('produces no Error instances anywhere in the summary (JSON-safe)', () => {
    const outcome: ToolRunOutcome = {
      kind: 'stalled',
      stalledOn: { toolId: 'browser.click', args: { type: 'click', ref: toElementRef('ax:1') } },
      results: [
        {
          toolCall: { toolId: 'browser.click', args: { type: 'click', ref: toElementRef('ax:1') } },
          attempt: 1,
          outcome: err(new ToolExecutionError('TOOL_EXECUTION_FAILED', 'stale ref')),
        },
      ],
    };

    const summary = summarizeRunOutcome(outcome);

    expect(() => JSON.stringify(summary)).not.toThrow();
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });
});

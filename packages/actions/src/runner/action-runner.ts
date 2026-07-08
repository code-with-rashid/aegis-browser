import { isErr, isOk, type Result } from '@aegis/shared';

import { executeAction, type ExecutorContext } from '../executors/dispatch';
import type { ActionExecutionError, ActionResult } from '../executors/types';
import type { Action } from '../schema';
import { actionSignature } from './action-signature';

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_STALL_THRESHOLD = 3;

/** One executed action, capturing which attempt succeeded (or that all attempts failed). */
export interface ActionRunResult {
  readonly action: Action;
  readonly attempt: number;
  readonly outcome: Result<ActionResult, ActionExecutionError>;
}

export interface RunActionsOptions {
  /** Extra attempts after the first on failure (default 2, so 3 attempts total). */
  readonly maxRetries?: number;
  /** Delay between retry attempts, in ms (default 250). */
  readonly retryDelayMs?: number;
  /** Consecutive identical actions (by {@link actionSignature}) that count as a stall (default 3). */
  readonly stallThreshold?: number;
  readonly signal?: AbortSignal;
}

export type RunOutcome =
  | { readonly kind: 'completed'; readonly results: readonly ActionRunResult[] }
  | {
      readonly kind: 'failed';
      readonly results: readonly ActionRunResult[];
      readonly failedAction: Action;
    }
  | {
      readonly kind: 'stalled';
      readonly results: readonly ActionRunResult[];
      readonly stalledOn: Action;
    }
  | { readonly kind: 'aborted'; readonly results: readonly ActionRunResult[] };

/** Orchestrates action execution: sequential, retried, stall-checked, and abortable. */
export interface ActionRunner {
  run(
    actions: readonly Action[],
    context: ExecutorContext,
    options?: RunActionsOptions,
  ): Promise<RunOutcome>;
  /** Every action result captured across every `run()` call so far, oldest first. */
  readonly history: readonly ActionRunResult[];
  /** Clears captured history — e.g. when the agent replans and starts a fresh sub-task. */
  reset(): void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Creates an {@link ActionRunner} with its own independent history. */
export function createActionRunner(): ActionRunner {
  let history: ActionRunResult[] = [];

  function wouldStall(candidate: Action, threshold: number): boolean {
    if (threshold <= 0) {
      return false;
    }
    const window = [...history.slice(-(threshold - 1)).map((r) => r.action), candidate];
    if (window.length < threshold) {
      return false;
    }
    const [first] = window;
    if (first === undefined) {
      return false;
    }
    const firstSignature = actionSignature(first);
    return window.every((action) => actionSignature(action) === firstSignature);
  }

  async function runOne(
    action: Action,
    context: ExecutorContext,
    maxRetries: number,
    retryDelayMs: number,
    signal?: AbortSignal,
  ): Promise<ActionRunResult> {
    let attempt = 1;
    for (;;) {
      const outcome = await executeAction(context, action);
      if (isOk(outcome) || attempt >= maxRetries + 1 || signal?.aborted) {
        return { action, attempt, outcome };
      }
      attempt += 1;
      await sleep(retryDelayMs, signal);
    }
  }

  return {
    get history() {
      return history;
    },
    reset() {
      history = [];
    },
    async run(actions, context, options = {}) {
      const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
      const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
      const stallThreshold = options.stallThreshold ?? DEFAULT_STALL_THRESHOLD;
      const runResults: ActionRunResult[] = [];

      for (const action of actions) {
        if (options.signal?.aborted) {
          return { kind: 'aborted', results: runResults };
        }

        if (wouldStall(action, stallThreshold)) {
          return { kind: 'stalled', results: runResults, stalledOn: action };
        }

        const result = await runOne(action, context, maxRetries, retryDelayMs, options.signal);
        history.push(result);
        runResults.push(result);

        if (options.signal?.aborted) {
          return { kind: 'aborted', results: runResults };
        }
        if (isErr(result.outcome)) {
          return { kind: 'failed', results: runResults, failedAction: action };
        }
      }

      return { kind: 'completed', results: runResults };
    },
  };
}

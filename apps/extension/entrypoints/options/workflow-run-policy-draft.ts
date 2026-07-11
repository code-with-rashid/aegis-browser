import type { RunPolicy } from '@aegis/workflows';

/**
 * Form-editable shape of a {@link RunPolicy} (#119) — `allowedToolIds`/`allowedOrigins`
 * are comma-separated text (an allow-list is usually short and typed by hand; a text
 * field beats managing an add/remove list widget for this), `maxStepsPerRun`/
 * `maxRunsPerDay` are raw text so a blank field can mean "no limit" without fighting
 * `<input type="number">`'s own empty-string-vs-zero ambiguity.
 */
export interface RunPolicyDraft {
  readonly allowedToolIds: string;
  readonly allowedOrigins: string;
  readonly allowStateChanging: boolean;
  readonly maxStepsPerRun: string;
  readonly maxRunsPerDay: string;
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function draftFromRunPolicy(policy: RunPolicy): RunPolicyDraft {
  return {
    allowedToolIds: policy.allowedToolIds.join(', '),
    allowedOrigins: policy.allowedOrigins.join(', '),
    allowStateChanging: policy.allowStateChanging,
    maxStepsPerRun: policy.maxStepsPerRun?.toString() ?? '',
    maxRunsPerDay: policy.maxRunsPerDay?.toString() ?? '',
  };
}

/** Blank/non-positive `maxStepsPerRun`/`maxRunsPerDay` text becomes "no limit" (the key is omitted, never set to `undefined`). */
export function runPolicyFromDraft(draft: RunPolicyDraft): RunPolicy {
  const maxStepsPerRun = Number.parseInt(draft.maxStepsPerRun, 10);
  const maxRunsPerDay = Number.parseInt(draft.maxRunsPerDay, 10);

  return {
    allowedToolIds: splitList(draft.allowedToolIds),
    allowedOrigins: splitList(draft.allowedOrigins),
    allowStateChanging: draft.allowStateChanging,
    ...(Number.isFinite(maxStepsPerRun) && maxStepsPerRun > 0 ? { maxStepsPerRun } : {}),
    ...(Number.isFinite(maxRunsPerDay) && maxRunsPerDay > 0 ? { maxRunsPerDay } : {}),
  };
}

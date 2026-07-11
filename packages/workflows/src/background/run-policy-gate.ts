import type { ActionRisk } from '@aegis/actions';

import type { RunPolicy } from '../schema';

export type StepGateDecision =
  { readonly kind: 'allow' } | { readonly kind: 'hard_stop'; readonly reason: string };

export interface StepGateInput {
  readonly toolId: string;
  readonly risk: ActionRisk;
  readonly runPolicy: RunPolicy;
}

/**
 * Enforces a workflow's own `RunPolicy` against one of its *recorded* steps before an
 * unattended run executes it (#117) — distinct from `heal-gate.ts`'s `gateHeal`, which
 * gates a Navigator-*proposed* fix and never lets `RunPolicy.allowStateChanging` skip
 * confirmation for it. A recorded step is different: it's exactly what the user recorded
 * and (by setting `allowStateChanging: true`) explicitly pre-authorized to replay
 * unattended, so a state-changing recorded step is allowed through when that flag is set
 * — there's no "unreviewed content" concern here the way there is for a healed fix.
 *
 * Only ever called for an unattended run: an attended run already goes through the live
 * agent loop's own policy/confirmation gate (Phase 1) if it ever falls back to one; a
 * deterministic replay has no separate attended-mode gate to bypass.
 */
export function gateOriginalStep(input: StepGateInput): StepGateDecision {
  if (
    input.runPolicy.allowedToolIds.length > 0 &&
    !input.runPolicy.allowedToolIds.includes(input.toolId)
  ) {
    return {
      kind: 'hard_stop',
      reason: `Tool "${input.toolId}" is outside the workflow's RunPolicy allow-list`,
    };
  }

  if (input.risk === 'state_changing' && !input.runPolicy.allowStateChanging) {
    return {
      kind: 'hard_stop',
      reason:
        "This step is state-changing and the workflow's RunPolicy does not authorize state-changing steps to run unattended",
    };
  }

  return { kind: 'allow' };
}

/** Checked once at the start of a run: the workflow's own `origin` must itself be pre-authorized when `RunPolicy.allowedOrigins` is non-empty. */
export function gateWorkflowOrigin(origin: string, runPolicy: RunPolicy): StepGateDecision {
  if (runPolicy.allowedOrigins.length > 0 && !runPolicy.allowedOrigins.includes(origin)) {
    return {
      kind: 'hard_stop',
      reason: `Origin "${origin}" is outside the workflow's RunPolicy allow-list`,
    };
  }
  return { kind: 'allow' };
}

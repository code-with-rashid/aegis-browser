import type { ActionRisk } from '@aegis/actions';

import type { RunPolicy } from '../schema';

/** Whether a human is present to answer a confirmation right now. */
export type RunMode = 'attended' | 'unattended';

export type HealGateDecision =
  | { readonly kind: 'auto_apply' }
  | { readonly kind: 'needs_confirmation' }
  | { readonly kind: 'hard_stop'; readonly reason: string };

export interface HealGateInput {
  readonly toolId: string;
  readonly risk: ActionRisk;
  readonly runPolicy: RunPolicy;
  readonly mode: RunMode;
}

/**
 * Decides whether a proposed heal may execute outright, needs a human's confirmation
 * first, or must hard-stop — `CLAUDE.md`'s "state-changing actions always require human
 * confirmation" invariant, applied to LLM-*proposed* content, plus the workflow's own
 * `RunPolicy` boundary (`docs/adr/0042-workflow-data-model-storage.md`: "a pre-
 * authorization... not something a run or a self-heal can ever expand").
 *
 * A heal never gets to lean on `RunPolicy.allowStateChanging` to skip confirmation: that
 * flag pre-authorizes the step as it was *recorded*, never a step the Navigator
 * improvised just now — the whole reason #114 exists ("healing can't become an attack
 * vector"). When unattended, a state-changing heal always hard-stops rather than
 * silently falling back to asking a human who isn't there; a heal whose tool id falls
 * outside the workflow's own allow-list hard-stops too, regardless of risk, since that's
 * an authorization boundary being exceeded, not just a risk heuristic.
 */
export function gateHeal(input: HealGateInput): HealGateDecision {
  if (input.mode === 'unattended') {
    if (
      input.runPolicy.allowedToolIds.length > 0 &&
      !input.runPolicy.allowedToolIds.includes(input.toolId)
    ) {
      return {
        kind: 'hard_stop',
        reason: `Tool "${input.toolId}" is outside the workflow's RunPolicy allow-list — a heal may never exceed it`,
      };
    }
    if (input.risk === 'state_changing') {
      return {
        kind: 'hard_stop',
        reason: 'A healed state-changing step cannot run unattended, with no one to confirm it',
      };
    }
    return { kind: 'auto_apply' };
  }

  if (input.risk === 'state_changing') {
    return { kind: 'needs_confirmation' };
  }
  return { kind: 'auto_apply' };
}

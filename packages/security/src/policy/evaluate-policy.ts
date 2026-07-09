import type { Action, ActionRisk, ActionRiskContext } from '@aegis/actions';
import { classifyActionRisk } from '@aegis/actions';

import { isDenyListedOrigin } from './deny-list';
import { isPolicyExpired, type PolicyMode, type SitePolicy } from './site-policy';

/** The three-way result of gating a proposed action against site policy + risk. */
export type PolicyDecision = 'allow' | 'confirm' | 'deny';

export interface EvaluatePolicyInput {
  readonly action: Action;
  readonly origin: string;
  /** The stored policy for `origin`, if any (`undefined` means "not yet configured"). */
  readonly policy?: SitePolicy;
  /** Extra risk-classification context (e.g. the target element's accessible name). */
  readonly riskContext?: ActionRiskContext;
  /** Epoch ms "now", for `expiresAt` comparison. Defaults to `Date.now()`. */
  readonly now?: number;
  /** Overrides the built-in deny-list, for testing. */
  readonly denyList?: readonly string[];
}

/**
 * Resolves the mode actually in effect for `origin`: the stored policy's mode, unless it's
 * absent/expired (default `"ask"`) or the origin is hard deny-listed and the stored policy
 * isn't an explicit `"allow"` opt-in (per `docs/DESIGN.md` §7.5 — deny-list wins unless the
 * user explicitly allows that exact origin).
 */
export function resolveEffectiveMode(
  origin: string,
  policy: SitePolicy | undefined,
  now: number,
  denyList?: readonly string[],
): PolicyMode {
  const active = policy !== undefined && !isPolicyExpired(policy, now) ? policy : undefined;

  if (isDenyListedOrigin(origin, denyList) && active?.mode !== 'allow') {
    return 'deny';
  }

  return active?.mode ?? 'ask';
}

/**
 * Decides what should happen to an action of `risk`, given the effective policy `mode` and
 * whether this origin has opted into unattended state-changing actions.
 *
 * - `deny` mode blocks everything, at every risk level.
 * - `read` actions always flow once not hard-denied — reading can't change page state.
 * - `state_changing` actions require both `allow` mode AND `allowStateChanging: true` to
 *   skip confirmation; every other combination (including plain `ask` mode) confirms,
 *   matching CLAUDE.md's "state-changing actions ALWAYS require human confirmation"
 *   invariant as the safe default.
 * - `navigate`/`input` actions flow under both `ask` and `allow` modes — only
 *   `state_changing` risk triggers the confirmation gate.
 */
export function decideForRisk(
  risk: ActionRisk,
  mode: PolicyMode,
  allowStateChanging: boolean,
): PolicyDecision {
  if (mode === 'deny') {
    return 'deny';
  }
  if (risk === 'read') {
    return 'allow';
  }
  if (risk === 'state_changing') {
    return mode === 'allow' && allowStateChanging ? 'allow' : 'confirm';
  }
  return 'allow';
}

/**
 * Pure policy evaluation: classifies `action`'s risk, resolves the effective mode for
 * `origin`, and decides `allow` / `confirm` / `deny`. No I/O — see `policy-store.ts` for
 * the persisted-policy lookup this is meant to be composed with.
 */
export function evaluatePolicy(input: EvaluatePolicyInput): PolicyDecision {
  const now = input.now ?? Date.now();
  const risk = classifyActionRisk(input.action, input.riskContext);
  const mode = resolveEffectiveMode(input.origin, input.policy, now, input.denyList);
  return decideForRisk(risk, mode, input.policy?.allowStateChanging ?? false);
}

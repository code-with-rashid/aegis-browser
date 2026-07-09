import type { Action, ActionRiskContext } from '@aegis/actions';
import { ok, type Result, type StorageError } from '@aegis/shared';

import { evaluatePolicy, type PolicyDecision } from './evaluate-policy';
import type { PolicyStore } from './policy-store';

/** The composed, I/O-performing policy engine: looks up `origin`'s policy, then decides. */
export interface PolicyEngine {
  evaluate(
    action: Action,
    origin: string,
    riskContext?: ActionRiskContext,
  ): Promise<Result<PolicyDecision, StorageError>>;
}

/** Wires a {@link PolicyStore} to the pure {@link evaluatePolicy} decision function. */
export function createPolicyEngine(store: PolicyStore): PolicyEngine {
  return {
    async evaluate(action, origin, riskContext) {
      const policyResult = await store.getPolicy(origin);
      if (!policyResult.ok) {
        return policyResult;
      }
      return ok(
        evaluatePolicy({
          action,
          origin,
          ...(policyResult.value !== undefined ? { policy: policyResult.value } : {}),
          ...(riskContext !== undefined ? { riskContext } : {}),
        }),
      );
    },
  };
}

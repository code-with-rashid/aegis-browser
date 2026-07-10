import type { ActionRisk } from '@aegis/actions';
import { ok, type Result, type StorageError } from '@aegis/shared';

import { evaluatePolicy, type PolicyDecision } from './evaluate-policy';
import type { PolicyStore } from './policy-store';

/** The composed, I/O-performing policy engine: looks up `origin`'s policy, then decides for a given, already-classified `risk`. */
export interface PolicyEngine {
  evaluate(risk: ActionRisk, origin: string): Promise<Result<PolicyDecision, StorageError>>;
}

/** Wires a {@link PolicyStore} to the pure {@link evaluatePolicy} decision function. */
export function createPolicyEngine(store: PolicyStore): PolicyEngine {
  return {
    async evaluate(risk, origin) {
      const policyResult = await store.getPolicy(origin);
      if (!policyResult.ok) {
        return policyResult;
      }
      return ok(
        evaluatePolicy({
          risk,
          origin,
          ...(policyResult.value !== undefined ? { policy: policyResult.value } : {}),
        }),
      );
    },
  };
}

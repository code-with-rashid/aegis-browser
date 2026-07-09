import { classifyActionRisk, type Action } from '@aegis/actions';
import { AgentError, type PolicyCheckOutput, type PolicyService } from '@aegis/agent';
import type { PolicyDecision, PolicyEngine } from '@aegis/security';
import { err, isErr, ok } from '@aegis/shared';

const DECISION_PRIORITY: Readonly<Record<PolicyDecision, number>> = {
  deny: 2,
  confirm: 1,
  allow: 0,
};

function reasonFor(decision: PolicyDecision, action: Action, origin: string): string | undefined {
  switch (decision) {
    case 'deny':
      return `${origin} denies this action`;
    case 'confirm':
      return `${action.type} (${classifyActionRisk(action)}) on ${origin} requires confirmation`;
    case 'allow':
      return undefined;
  }
}

/**
 * Adapts `@aegis/security`'s `PolicyEngine` (one action at a time, three-way
 * allow/confirm/deny) to `@aegis/agent`'s `PolicyService` port (a batch of actions,
 * `{decision, reason?}`) — the composition-root wiring both packages' ADRs (0010, 0011)
 * deferred, since `@aegis/agent` and `@aegis/security` are siblings that never import
 * each other directly. The batch's overall decision is the strictest of any single
 * action's (`deny` > `confirm` > `allow`), regardless of the order actions were proposed
 * in — a `deny` later in the list must still block the whole batch.
 *
 * `getOrigin` is resolved fresh on every check (not cached) since a `navigate` action
 * earlier in the same run can change the page's origin mid-task.
 */
export function createPolicyService(
  engine: PolicyEngine,
  getOrigin: () => Promise<string>,
): PolicyService {
  return async (input) => {
    let origin: string;
    try {
      origin = await getOrigin();
    } catch (cause) {
      return err(
        new AgentError('POLICY_CHECK_FAILED', 'Could not resolve the current page origin', {
          cause,
        }),
      );
    }

    let strictest: { decision: PolicyDecision; action: Action } | undefined;

    for (const action of input.actions) {
      const result = await engine.evaluate(action, origin);
      if (isErr(result)) {
        return err(
          new AgentError('POLICY_CHECK_FAILED', 'Policy engine failed to evaluate an action', {
            cause: result.error,
          }),
        );
      }

      if (
        strictest === undefined ||
        DECISION_PRIORITY[result.value] > DECISION_PRIORITY[strictest.decision]
      ) {
        strictest = { decision: result.value, action };
      }
    }

    if (strictest === undefined) {
      const output: PolicyCheckOutput = { decision: 'allow' };
      return ok(output);
    }

    const reason = reasonFor(strictest.decision, strictest.action, origin);
    const output: PolicyCheckOutput = {
      decision: strictest.decision,
      ...(reason !== undefined ? { reason } : {}),
    };
    return ok(output);
  };
}

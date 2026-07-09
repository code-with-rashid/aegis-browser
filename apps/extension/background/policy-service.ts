import { classifyActionRisk, type Action } from '@aegis/actions';
import { AgentError, type PolicyCheckOutput, type PolicyService } from '@aegis/agent';
import type { PerceptionPayload } from '@aegis/perception';
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

/** The ref an action targets, for the action types that have one — `undefined` for the rest. */
function refOf(action: Action): string | undefined {
  switch (action.type) {
    case 'click':
    case 'input_text':
    case 'scroll':
    case 'get_dropdown_options':
    case 'select_dropdown_option':
    case 'send_keys':
      return action.ref;
    case 'navigate':
    case 'go_back':
    case 'open_tab':
    case 'switch_tab':
    case 'close_tab':
    case 'wait':
    case 'extract':
    case 'done':
      return undefined;
  }
}

/**
 * The accessible name of `action`'s target element, if it has one and `perception`
 * still has it listed — feeds `ActionRiskContext.elementName`, the signal that elevates
 * an ordinary interaction to `state_changing` (e.g. a button literally named "Buy Now").
 */
function elementNameFor(
  action: Action,
  perception: PerceptionPayload | undefined,
): string | undefined {
  const ref = refOf(action);
  if (ref === undefined || perception === undefined) {
    return undefined;
  }
  return perception.elements.find((element) => element.ref === ref)?.name;
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
 * earlier in the same run can change the page's origin mid-task. Each action's target
 * element name (from `input.perception`, when present) is resolved into an
 * `ActionRiskContext` and passed to `engine.evaluate` — without this, the policy
 * engine's `STATE_CHANGING_KEYWORDS` risk elevation could never actually trigger.
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
      const elementName = elementNameFor(action, input.perception);
      const result = await engine.evaluate(
        action,
        origin,
        elementName !== undefined ? { elementName } : undefined,
      );
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

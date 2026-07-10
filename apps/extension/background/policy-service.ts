import type { Action, ActionRisk, ToolRegistry } from '@aegis/actions';
import {
  AgentError,
  type PolicyCheckOutput,
  type PolicyService,
  type ToolCall,
} from '@aegis/agent';
import type { PerceptionPayload } from '@aegis/perception';
import type { PolicyDecision, PolicyEngine } from '@aegis/security';
import { err, isErr, ok } from '@aegis/shared';

const DECISION_PRIORITY: Readonly<Record<PolicyDecision, number>> = {
  deny: 2,
  confirm: 1,
  allow: 0,
};

function reasonFor(
  decision: PolicyDecision,
  toolId: string,
  risk: ActionRisk,
  origin: string,
): string | undefined {
  switch (decision) {
    case 'deny':
      return `${origin} denies this tool call`;
    case 'confirm':
      return `${toolId} (${risk}) on ${origin} requires confirmation`;
    case 'allow':
      return undefined;
  }
}

/** The ref a browser action targets, for the action types that have one — `undefined` for the rest. */
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
 * The accessible name of a browser tool call's target element, if it has one and
 * `perception` still has it listed — feeds `ActionRiskContext.elementName`, the signal
 * that elevates an ordinary interaction to `state_changing` (e.g. a button literally
 * named "Buy Now"). Non-browser tool calls have no page element to resolve.
 */
function elementNameFor(
  toolCall: ToolCall,
  tool: { readonly source: string } | undefined,
  perception: PerceptionPayload | undefined,
): string | undefined {
  if (tool?.source !== 'browser' || perception === undefined) {
    return undefined;
  }
  const ref = refOf(toolCall.args as Action);
  if (ref === undefined) {
    return undefined;
  }
  return perception.elements.find((element) => element.ref === ref)?.name;
}

/** The URL a browser `navigate`/`open_tab` tool call would navigate the browser to, if any. */
function destinationUrlFor(
  toolCall: ToolCall,
  tool: { readonly source: string } | undefined,
): string | undefined {
  if (tool?.source !== 'browser') {
    return undefined;
  }
  const action = toolCall.args as Action;
  switch (action.type) {
    case 'navigate':
      return action.url;
    case 'open_tab':
      return action.url;
    case 'click':
    case 'input_text':
    case 'scroll':
    case 'go_back':
    case 'switch_tab':
    case 'close_tab':
    case 'get_dropdown_options':
    case 'select_dropdown_option':
    case 'send_keys':
    case 'wait':
    case 'extract':
    case 'done':
      return undefined;
  }
}

/**
 * The origin to policy-check a tool call against: for a browser `navigate`/`open_tab`
 * call (one that takes the browser somewhere new), that's the *destination*'s origin — a
 * deny-listed origin must be unreachable by navigating there, not just
 * unreachable-to-act-on once already on it, otherwise an injected "navigate to chase.com"
 * instruction would sail through a policy check that only ever inspected the page the
 * agent started on. Every other tool call is checked against `currentOrigin`, since a
 * browser tool acts on the page the agent is already on; a non-browser tool call (MCP/
 * WebMCP, #85-#87) has no separate "destination" concept yet either, so it's checked
 * against the current page's origin too, pending those issues' own permissioning layer.
 */
function originToCheck(
  toolCall: ToolCall,
  tool: { readonly source: string } | undefined,
  currentOrigin: string,
): string {
  const destinationUrl = destinationUrlFor(toolCall, tool);
  if (destinationUrl === undefined) {
    return currentOrigin;
  }
  try {
    return new URL(destinationUrl).origin;
  } catch {
    return currentOrigin;
  }
}

/**
 * Adapts `@aegis/security`'s `PolicyEngine` (one already-classified risk at a time,
 * three-way allow/confirm/deny) to `@aegis/agent`'s `PolicyService` port (a batch of tool
 * calls, `{decision, reason?}`) — the composition-root wiring both packages' ADRs (0010,
 * 0011, 0082) deferred, since `@aegis/agent` and `@aegis/security` are siblings that
 * never import each other directly. The batch's overall decision is the strictest of any
 * single tool call's (`deny` > `confirm` > `allow`), regardless of the order they were
 * proposed in — a `deny` later in the list must still block the whole batch.
 *
 * Every tool call — from any source, not just `browser` — is routed through the same
 * policy engine (Phase 2, #82): `toolRegistry.classify` resolves each call's risk (fail
 * safe to `state_changing` for an unrecognized tool id), and a browser call's target
 * element name (from `input.perception`, when present) feeds that classification's
 * `STATE_CHANGING_KEYWORDS` elevation exactly as before. `getOrigin` is resolved fresh on
 * every check (not cached) since a `navigate` tool call earlier in the same run can
 * change the page's origin mid-task.
 */
export function createPolicyService(
  engine: PolicyEngine,
  getOrigin: () => Promise<string>,
  toolRegistry: ToolRegistry,
): PolicyService {
  return async (input) => {
    let currentOrigin: string;
    try {
      currentOrigin = await getOrigin();
    } catch (cause) {
      return err(
        new AgentError('POLICY_CHECK_FAILED', 'Could not resolve the current page origin', {
          cause,
        }),
      );
    }

    let strictest:
      | { decision: PolicyDecision; toolCall: ToolCall; risk: ActionRisk; checkedOrigin: string }
      | undefined;

    for (const toolCall of input.toolCalls) {
      const tool = toolRegistry.get(toolCall.toolId);
      const elementName = elementNameFor(toolCall, tool, input.perception);
      const risk = toolRegistry.classify(
        toolCall.toolId,
        elementName !== undefined ? { elementName } : undefined,
      );
      const checkedOrigin = originToCheck(toolCall, tool, currentOrigin);
      const result = await engine.evaluate(risk, checkedOrigin);
      if (isErr(result)) {
        return err(
          new AgentError('POLICY_CHECK_FAILED', 'Policy engine failed to evaluate a tool call', {
            cause: result.error,
          }),
        );
      }

      if (
        strictest === undefined ||
        DECISION_PRIORITY[result.value] > DECISION_PRIORITY[strictest.decision]
      ) {
        strictest = { decision: result.value, toolCall, risk, checkedOrigin };
      }
    }

    if (strictest === undefined) {
      const output: PolicyCheckOutput = { decision: 'allow' };
      return ok(output);
    }

    const reason = reasonFor(
      strictest.decision,
      strictest.toolCall.toolId,
      strictest.risk,
      strictest.checkedOrigin,
    );
    const output: PolicyCheckOutput = {
      decision: strictest.decision,
      ...(reason !== undefined ? { reason } : {}),
    };
    return ok(output);
  };
}

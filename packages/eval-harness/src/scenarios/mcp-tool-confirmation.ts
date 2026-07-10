import type { FakeModelResponder } from '../fake-model-server';

export const MCP_TOOL_CONFIRMATION_TASK = 'Place an order for 3 widgets.';
/** `mcp.<toIdSegment(serverName)>.<toolName>` for a server registered as `shop` (`packages/mcp/src/registry/tool-id.ts`). */
export const MCP_TOOL_CONFIRMATION_TOOL_ID = 'mcp.shop.place_order';

/**
 * Scripted sequence for a state-changing MCP tool call: the Navigator proposes calling
 * `place_order` (no `readOnlyHint`, so `@aegis/mcp` fail-safe infers `state_changing` risk,
 * #85), the real policy engine requires confirmation (no stored `SitePolicy` for this
 * origin defaults to `ask`, `docs/adr/0009-policy-decision-matrix.md`), and the critic
 * judges it aligned with what the user actually asked for.
 */
export function createMcpToolConfirmationResponder(): FakeModelResponder {
  return (systemPrompt, _userPrompt, callIndex) => {
    if (systemPrompt.includes('You are the Planner')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'An order-placing tool is available.',
          reasoning: 'Calling it places the order the user asked for.',
          memory: '',
          nextGoal: 'Place the order for 3 widgets',
          plan: ['Call the order tool'],
          taskComplete: false,
        });
      }
      return JSON.stringify({
        observation: 'The order was placed.',
        reasoning: 'The task is complete.',
        memory: '',
        nextGoal: 'Report the order was placed',
        plan: [],
        taskComplete: true,
        summary: 'The order for 3 widgets was placed.',
      });
    }

    if (systemPrompt.includes('You are the Navigator')) {
      return JSON.stringify({
        observation: 'The order tool can place this order directly.',
        reasoning: 'Calling it places the order.',
        memory: '',
        nextGoal: 'Place the order for 3 widgets',
        toolCalls: [
          { toolId: MCP_TOOL_CONFIRMATION_TOOL_ID, args: { item: 'widget', quantity: 3 } },
        ],
      });
    }

    if (systemPrompt.includes('You are the Alignment Critic')) {
      return JSON.stringify({
        reasoning: 'The user explicitly asked to place this order; it matches their intent.',
        aligned: true,
      });
    }

    if (systemPrompt.includes('You are the Verifier')) {
      return JSON.stringify({
        reasoning: 'The tool call succeeded.',
        subGoalAchieved: true,
        taskComplete: false,
      });
    }

    throw new Error(`Unexpected system prompt for mcp-tool-confirmation: ${systemPrompt}`);
  };
}

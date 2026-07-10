import type { FakeModelResponder } from '../fake-model-server';

export const MCP_TOOL_TASK = "What's the weather forecast in Paris?";
export const MCP_TOOL_TASK_FIXTURE = 'mcp-tool-task.html';
export const MCP_TOOL_TASK_EXPECTED_SUMMARY = 'Sunny, 22C, in Paris';
/** `mcp.<toIdSegment(serverName)>.<toolName>` for a server registered as `weather` (`packages/mcp/src/registry/tool-id.ts`). */
export const MCP_TOOL_ID = 'mcp.weather.get_forecast';

/**
 * Scripted sequence for a real MCP tool completing the whole task directly, with no page
 * interaction at all — a real `MockMcpServer` exposes a `read`-risk `get_forecast` tool
 * (`annotations: { readOnlyHint: true }`), so the Navigator calls it and the loop never
 * touches the fixture page's DOM.
 */
export function createMcpToolTaskResponder(): FakeModelResponder {
  return (systemPrompt, _userPrompt, callIndex) => {
    if (systemPrompt.includes('You are the Planner')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'A weather-forecast tool is available.',
          reasoning: 'Call the tool directly to answer the question.',
          memory: '',
          nextGoal: 'Look up the Paris forecast',
          plan: ['Call the weather tool', 'Report the forecast'],
          taskComplete: false,
        });
      }
      return JSON.stringify({
        observation: 'The forecast has been found.',
        reasoning: 'The task is complete.',
        memory: `Forecast: ${MCP_TOOL_TASK_EXPECTED_SUMMARY}`,
        nextGoal: 'Report the forecast',
        plan: [],
        taskComplete: true,
        summary: MCP_TOOL_TASK_EXPECTED_SUMMARY,
      });
    }

    if (systemPrompt.includes('You are the Navigator')) {
      return JSON.stringify({
        observation: 'A declared MCP tool can answer this directly.',
        reasoning: 'Call the weather tool for Paris.',
        memory: '',
        nextGoal: 'Look up the Paris forecast',
        toolCalls: [{ toolId: MCP_TOOL_ID, args: { city: 'Paris' } }],
      });
    }

    if (systemPrompt.includes('You are the Verifier')) {
      return JSON.stringify({
        reasoning: 'The tool returned the forecast.',
        subGoalAchieved: true,
        taskComplete: false,
      });
    }

    throw new Error(`Unexpected system prompt for mcp-tool-task: ${systemPrompt}`);
  };
}

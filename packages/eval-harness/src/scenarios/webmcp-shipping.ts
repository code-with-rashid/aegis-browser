import type { FakeModelResponder } from '../fake-model-server';
import { findRef } from '../find-ref';

export const WEBMCP_SHIPPING_TASK =
  'Find the shipping estimate for a delivery to Freedonia and report it.';

export const WEBMCP_SHIPPING_EXPECTED_SUMMARY =
  'Estimated delivery: 5-7 business days to Freedonia';

export const WEBMCP_SHIPPING_FIXTURE = 'webmcp-shipping.html';
export const WEBMCP_SHIPPING_FALLBACK_FIXTURE = 'webmcp-shipping-fallback.html';

/**
 * Scripted sequence for `webmcp-shipping.html`: the page declares a `get_shipping_estimate`
 * WebMCP tool, so the Navigator calls it directly instead of driving the calculator UI —
 * one `acting` cycle total, versus the two the fallback scenario needs.
 */
export function createWebMcpShippingResponder(): FakeModelResponder {
  return (systemPrompt, _userPrompt, callIndex) => {
    if (systemPrompt.includes('You are the Planner')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'A shipping estimate to Freedonia is needed.',
          reasoning: 'A declared tool can look this up directly, without the calculator UI.',
          memory: '',
          nextGoal: 'Look up the shipping estimate for Freedonia',
          plan: ['Look up the shipping estimate', 'Report it'],
          taskComplete: false,
        });
      }
      return JSON.stringify({
        observation: 'The shipping estimate has been found.',
        reasoning: 'The task is complete.',
        memory: `Shipping estimate: ${WEBMCP_SHIPPING_EXPECTED_SUMMARY}`,
        nextGoal: 'Report the shipping estimate',
        plan: [],
        taskComplete: true,
        summary: `The ${WEBMCP_SHIPPING_EXPECTED_SUMMARY.toLowerCase()}`,
      });
    }

    if (systemPrompt.includes('You are the Navigator')) {
      return JSON.stringify({
        observation: 'A declared tool can look up the shipping estimate directly.',
        reasoning:
          'Prefer the declared tool over the calculator UI — it directly covers the sub-goal.',
        memory: '',
        nextGoal: 'Look up the shipping estimate for Freedonia',
        toolCalls: [{ toolId: 'web.get_shipping_estimate', args: { destination: 'Freedonia' } }],
      });
    }

    if (systemPrompt.includes('You are the Verifier')) {
      return JSON.stringify({
        reasoning: 'The declared tool returned the estimate.',
        subGoalAchieved: true,
        taskComplete: false,
      });
    }

    throw new Error(`Unexpected system prompt for webmcp-shipping: ${systemPrompt}`);
  };
}

/**
 * Scripted sequence for `webmcp-shipping-fallback.html` (the identical page minus
 * WebMCP): no `web.get_shipping_estimate` tool is ever offered, so the Navigator drives
 * the calculator UI instead — select the destination and click Calculate (two actions,
 * one turn), then a second turn to read the revealed estimate. Two `acting` cycles, not
 * one — the DOM path this scenario falls back to correctly, still completing the task.
 */
export function createWebMcpShippingFallbackResponder(): FakeModelResponder {
  return (systemPrompt, userPrompt, callIndex) => {
    if (systemPrompt.includes('You are the Planner')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'No declared tool is available; the calculator UI must be used.',
          reasoning: 'Select the destination and calculate the estimate.',
          memory: '',
          nextGoal: 'Use the calculator to find the shipping estimate for Freedonia',
          plan: ['Use the calculator', 'Read the estimate'],
          taskComplete: false,
        });
      }
      if (callIndex === 1) {
        return JSON.stringify({
          observation: 'The calculator now shows the estimate.',
          reasoning: 'Read the revealed estimate.',
          memory: 'Calculator used for Freedonia',
          nextGoal: 'Read the revealed shipping estimate',
          plan: ['Read the estimate'],
          taskComplete: false,
        });
      }
      return JSON.stringify({
        observation: 'The shipping estimate has been read.',
        reasoning: 'The task is complete.',
        memory: `Shipping estimate: ${WEBMCP_SHIPPING_EXPECTED_SUMMARY}`,
        nextGoal: 'Report the shipping estimate',
        plan: [],
        taskComplete: true,
        summary: `The ${WEBMCP_SHIPPING_EXPECTED_SUMMARY.toLowerCase()}`,
      });
    }

    if (systemPrompt.includes('You are the Navigator')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'A destination dropdown and a Calculate button are available.',
          reasoning: 'Select Freedonia, then calculate the estimate.',
          memory: '',
          nextGoal: 'Use the calculator to find the shipping estimate for Freedonia',
          toolCalls: [
            {
              toolId: 'browser.select_dropdown_option',
              args: {
                type: 'select_dropdown_option',
                ref: findRef(userPrompt, 'Destination'),
                value: 'Freedonia',
              },
            },
            {
              toolId: 'browser.click',
              args: { type: 'click', ref: findRef(userPrompt, 'Calculate') },
            },
          ],
        });
      }
      return JSON.stringify({
        observation: 'The estimate is now visible in the page content.',
        reasoning: 'Extracting the page content surfaces the estimate.',
        memory: '',
        nextGoal: 'Read the revealed shipping estimate',
        toolCalls: [
          {
            toolId: 'browser.extract',
            args: { type: 'extract', instructions: 'Read the shipping estimate' },
          },
        ],
      });
    }

    if (systemPrompt.includes('You are the Verifier')) {
      return JSON.stringify({
        reasoning: 'The action succeeded; the overall task is not reported yet.',
        subGoalAchieved: true,
        taskComplete: false,
      });
    }

    throw new Error(`Unexpected system prompt for webmcp-shipping-fallback: ${systemPrompt}`);
  };
}

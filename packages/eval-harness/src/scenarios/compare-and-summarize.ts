import type { FakeModelResponder } from '../fake-model-server';
import { findRef } from '../find-ref';

export const COMPARE_AND_SUMMARIZE_TASK =
  'Reveal Plan B, then compare Plan A and Plan B and tell me which is cheaper.';

export const COMPARE_AND_SUMMARIZE_EXPECTED_SUMMARY = 'Plan B is cheaper';

export const COMPARE_AND_SUMMARIZE_FIXTURE = 'compare.html';

/**
 * Scripted sequence for `compare.html`: click reveals Plan B's hidden price (a real DOM
 * change re-perceived before the next Navigator call), then `extract` reads both prices,
 * then the Planner reports the comparison.
 */
export function createCompareAndSummarizeResponder(): FakeModelResponder {
  return (systemPrompt, userPrompt, callIndex) => {
    if (systemPrompt.includes('You are the Planner')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'Plan A is visible; Plan B is hidden behind a reveal button.',
          reasoning: "Plan B's price must be revealed before it can be compared.",
          memory: '',
          nextGoal: "Reveal Plan B's price",
          plan: ["Reveal Plan B's price", 'Compare both prices'],
          taskComplete: false,
        });
      }
      if (callIndex === 1) {
        return JSON.stringify({
          observation: "Plan B's price is now revealed.",
          reasoning: 'Both prices are now visible; extract and compare them.',
          memory: 'Plan A: $10/mo',
          nextGoal: 'Extract both plan prices and compare them',
          plan: ['Compare both prices'],
          taskComplete: false,
        });
      }
      return JSON.stringify({
        observation: 'Both prices have been extracted.',
        reasoning: 'Plan B is cheaper than Plan A.',
        memory: 'Plan A: $10/mo, Plan B: $8/mo',
        nextGoal: 'Report the comparison',
        plan: [],
        taskComplete: true,
        summary: `${COMPARE_AND_SUMMARIZE_EXPECTED_SUMMARY} at $8/mo vs Plan A's $10/mo.`,
      });
    }

    if (systemPrompt.includes('You are the Navigator')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'A "Reveal Plan B price" button is available.',
          reasoning: "Clicking it reveals Plan B's price.",
          memory: '',
          nextGoal: "Reveal Plan B's price",
          toolCalls: [
            {
              toolId: 'browser.click',
              args: { type: 'click', ref: findRef(userPrompt, 'Reveal Plan B price') },
            },
          ],
        });
      }
      return JSON.stringify({
        observation: 'Both plan prices are now visible in the page content.',
        reasoning: 'Extracting the page content surfaces both prices.',
        memory: '',
        nextGoal: 'Extract both plan prices and compare them',
        toolCalls: [
          {
            toolId: 'browser.extract',
            args: { type: 'extract', instructions: 'Extract both plan prices for comparison' },
          },
        ],
      });
    }

    if (systemPrompt.includes('You are the Verifier')) {
      return JSON.stringify({
        reasoning: 'The action succeeded; the overall comparison is not reported yet.',
        subGoalAchieved: true,
        taskComplete: false,
      });
    }

    throw new Error(`Unexpected system prompt for compare-and-summarize: ${systemPrompt}`);
  };
}

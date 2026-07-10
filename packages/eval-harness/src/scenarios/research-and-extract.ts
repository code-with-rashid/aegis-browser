import type { FakeModelResponder } from '../fake-model-server';

export const RESEARCH_AND_EXTRACT_TASK =
  'Find the capital of Freedonia mentioned on this page and report it.';

export const RESEARCH_AND_EXTRACT_EXPECTED_SUMMARY = 'Fredonia City';

export const RESEARCH_AND_EXTRACT_FIXTURE = 'research.html';

/**
 * Scripted planner -> navigator -> verifier -> planner sequence for `research.html`:
 * one `extract` reads the page (the fact is already in perceived content, no ref
 * needed), the verifier defers overall completion back to the planner, which then
 * reports the answer as `taskSummary`.
 */
export function createResearchAndExtractResponder(): FakeModelResponder {
  return (systemPrompt, _userPrompt, callIndex) => {
    if (systemPrompt.includes('You are the Planner')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'A fresh page has not been perceived yet.',
          reasoning: 'The task asks for a fact stated on the page; read it first.',
          memory: '',
          nextGoal: 'Read the page and find the capital of Freedonia',
          plan: ['Read the page', 'Report the capital'],
          taskComplete: false,
        });
      }
      return JSON.stringify({
        observation: 'The page states the capital of Freedonia.',
        reasoning: 'The fact has been extracted; the task is complete.',
        memory: 'Capital of Freedonia: Fredonia City',
        nextGoal: 'Report the capital',
        plan: [],
        taskComplete: true,
        summary: `The capital of Freedonia is ${RESEARCH_AND_EXTRACT_EXPECTED_SUMMARY}.`,
      });
    }

    if (systemPrompt.includes('You are the Navigator')) {
      return JSON.stringify({
        observation: 'The page text is visible in the perceived content.',
        reasoning: 'Extracting the page content surfaces the requested fact.',
        memory: '',
        nextGoal: 'Read the page and find the capital of Freedonia',
        toolCalls: [
          {
            toolId: 'browser.extract',
            args: { type: 'extract', instructions: 'Find the capital of Freedonia' },
          },
        ],
      });
    }

    if (systemPrompt.includes('You are the Verifier')) {
      return JSON.stringify({
        reasoning: 'The extract action surfaced the fact; still need to report it.',
        subGoalAchieved: true,
        taskComplete: false,
      });
    }

    throw new Error(`Unexpected system prompt for research-and-extract: ${systemPrompt}`);
  };
}

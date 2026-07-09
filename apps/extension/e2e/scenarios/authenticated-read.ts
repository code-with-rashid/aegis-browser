import type { FakeModelResponder } from '../fake-model-server';
import { findRef } from '../find-ref';

export const AUTHENTICATED_READ_TASK =
  'Enter access code 1234 to unlock the members area, then report the secret fact revealed.';

export const AUTHENTICATED_READ_EXPECTED_SUMMARY = 'vault opens at midnight';

/**
 * Scripted sequence for `gated.html`: type the access code and click Enter (two actions
 * in one Navigator call), which reveals the protected content client-side; the next
 * perceive picks up the revealed text, `extract` reads it, and the Planner reports it.
 *
 * Deliberately named "access code" / "Enter" rather than "password" / "submit" — real
 * classifier keywords (`STATE_CHANGING_KEYWORDS`) that would elevate an action's risk to
 * `state_changing` and require human confirmation, out of scope for a read-only E2E case
 * (that's #32).
 */
export function createAuthenticatedReadResponder(): FakeModelResponder {
  return (systemPrompt, userPrompt, callIndex) => {
    if (systemPrompt.includes('You are the Planner')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'The members area is gated behind an access code field.',
          reasoning: 'Enter the code to unlock the protected content.',
          memory: '',
          nextGoal: 'Enter the access code and unlock the page',
          plan: ['Enter the access code', 'Read the secret fact'],
          taskComplete: false,
        });
      }
      if (callIndex === 1) {
        return JSON.stringify({
          observation: 'The page is now unlocked.',
          reasoning: 'The protected content is visible; read it.',
          memory: 'Access code accepted',
          nextGoal: 'Read the revealed secret fact',
          plan: ['Read the secret fact'],
          taskComplete: false,
        });
      }
      return JSON.stringify({
        observation: 'The secret fact has been read.',
        reasoning: 'The task is complete.',
        memory: 'Secret fact read',
        nextGoal: 'Report the secret fact',
        plan: [],
        taskComplete: true,
        summary: `The ${AUTHENTICATED_READ_EXPECTED_SUMMARY}.`,
      });
    }

    if (systemPrompt.includes('You are the Navigator')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'An access code field and an Enter button are available.',
          reasoning: 'Type the code, then click Enter to unlock the page.',
          memory: '',
          nextGoal: 'Enter the access code and unlock the page',
          actions: [
            { type: 'input_text', ref: findRef(userPrompt, 'Access code'), text: '1234' },
            { type: 'click', ref: findRef(userPrompt, 'Enter') },
          ],
        });
      }
      return JSON.stringify({
        observation: 'The secret fact is now visible in the page content.',
        reasoning: 'Extracting the page content surfaces the secret fact.',
        memory: '',
        nextGoal: 'Read the revealed secret fact',
        actions: [{ type: 'extract', instructions: 'Read the revealed secret fact' }],
      });
    }

    if (systemPrompt.includes('You are the Verifier')) {
      return JSON.stringify({
        reasoning: 'The action succeeded; the overall task is not reported yet.',
        subGoalAchieved: true,
        taskComplete: false,
      });
    }

    throw new Error(`Unexpected system prompt for authenticated-read: ${systemPrompt}`);
  };
}

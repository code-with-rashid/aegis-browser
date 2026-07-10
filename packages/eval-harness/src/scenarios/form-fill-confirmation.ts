import type { FakeModelResponder } from '../fake-model-server';
import { findRef } from '../find-ref';

export const FORM_FILL_CONFIRMATION_TASK = 'Buy the Widget for $25.00 by clicking Buy Now.';

export const FORM_FILL_CONFIRMATION_FIXTURE = 'checkout.html';

/**
 * Scripted sequence for `checkout.html`: the Navigator proposes a `click` on "Buy Now" —
 * its accessible name matches `STATE_CHANGING_KEYWORDS` ("buy"), so the real policy
 * engine elevates this to `state_changing` risk and the loop must pause in `confirming`
 * rather than run it. The Critic judges it aligned (the user did ask to buy this), so the
 * gate genuinely reaches the human rather than being blocked earlier for an unrelated
 * reason. After the E2E test rejects it, the Planner reports the task as not completed —
 * the point being proven is that the click never ran, not that the task finishes.
 */
export function createFormFillConfirmationResponder(): FakeModelResponder {
  return (systemPrompt, userPrompt, callIndex) => {
    if (systemPrompt.includes('You are the Planner')) {
      if (callIndex === 0) {
        return JSON.stringify({
          observation: 'A "Buy Now" button is available for the Widget.',
          reasoning: 'Clicking it completes the purchase the user asked for.',
          memory: '',
          nextGoal: 'Click Buy Now to complete the purchase',
          plan: ['Click Buy Now'],
          taskComplete: false,
        });
      }
      return JSON.stringify({
        observation: 'The purchase was not approved by the user.',
        reasoning: 'Without approval, the purchase cannot proceed.',
        memory: '',
        nextGoal: 'Report that the purchase was not completed',
        plan: [],
        taskComplete: true,
        summary: 'The purchase was not approved, so no action was taken.',
      });
    }

    if (systemPrompt.includes('You are the Navigator')) {
      return JSON.stringify({
        observation: 'A "Buy Now" button is available.',
        reasoning: 'Clicking it completes the purchase.',
        memory: '',
        nextGoal: 'Click Buy Now to complete the purchase',
        toolCalls: [
          { toolId: 'browser.click', args: { type: 'click', ref: findRef(userPrompt, 'Buy Now') } },
        ],
      });
    }

    if (systemPrompt.includes('You are the Alignment Critic')) {
      return JSON.stringify({
        reasoning: 'The user explicitly asked to buy this item; the action matches their intent.',
        aligned: true,
      });
    }

    throw new Error(`Unexpected system prompt for form-fill-confirmation: ${systemPrompt}`);
  };
}

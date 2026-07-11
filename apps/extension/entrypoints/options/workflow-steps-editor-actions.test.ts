import type { WorkflowStep } from '@aegis/workflows';
import { toWorkflowStepId } from '@aegis/workflows';
import { describe, expect, it } from 'vitest';

import {
  expectSummary,
  moveStepDown,
  moveStepUp,
  removeStepAt,
  targetSummary,
} from './workflow-steps-editor-actions';

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    stepId: toWorkflowStepId('step-1'),
    toolId: 'browser.click',
    args: {},
    ...overrides,
  };
}

const STEPS = [
  step({ stepId: toWorkflowStepId('a'), toolId: 'browser.click' }),
  step({ stepId: toWorkflowStepId('b'), toolId: 'browser.input_text' }),
  step({ stepId: toWorkflowStepId('c'), toolId: 'browser.send_keys' }),
];

describe('moveStepUp', () => {
  it('swaps a step with the one before it', () => {
    const result = moveStepUp(STEPS, 1);
    expect(result.map((s) => s.stepId)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op for the first step', () => {
    expect(moveStepUp(STEPS, 0).map((s) => s.stepId)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op for an out-of-range index', () => {
    expect(moveStepUp(STEPS, 10).map((s) => s.stepId)).toEqual(['a', 'b', 'c']);
  });
});

describe('moveStepDown', () => {
  it('swaps a step with the one after it', () => {
    const result = moveStepDown(STEPS, 0);
    expect(result.map((s) => s.stepId)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op for the last step', () => {
    expect(moveStepDown(STEPS, 2).map((s) => s.stepId)).toEqual(['a', 'b', 'c']);
  });
});

describe('removeStepAt', () => {
  it('removes only the step at the given index', () => {
    expect(removeStepAt(STEPS, 1).map((s) => s.stepId)).toEqual(['a', 'c']);
  });

  it('is a no-op for an out-of-range index', () => {
    expect(removeStepAt(STEPS, 10).map((s) => s.stepId)).toEqual(['a', 'b', 'c']);
  });
});

describe('targetSummary', () => {
  it('returns undefined when the step has no target', () => {
    expect(targetSummary(step())).toBeUndefined();
  });

  it('prefers selector when present', () => {
    expect(targetSummary(step({ target: { selector: '#search', role: 'textbox' } }))).toBe(
      '#search',
    );
  });

  it('falls back to role + name when there is no selector', () => {
    expect(targetSummary(step({ target: { role: 'button', name: 'Add to cart' } }))).toBe(
      'button Add to cart',
    );
  });

  it('falls back to ref as a last resort', () => {
    expect(targetSummary(step({ target: { ref: 'ax:1' } }))).toBe('ax:1');
  });
});

describe('expectSummary', () => {
  it('returns undefined when the step has no post-condition', () => {
    expect(expectSummary(step())).toBeUndefined();
  });

  it('summarizes element_visible', () => {
    expect(expectSummary(step({ expect: { type: 'element_visible', selector: '#done' } }))).toBe(
      'element visible: #done',
    );
  });

  it('summarizes element_hidden', () => {
    expect(expectSummary(step({ expect: { type: 'element_hidden', selector: '#spinner' } }))).toBe(
      'element hidden: #spinner',
    );
  });

  it('summarizes url_matches', () => {
    expect(
      expectSummary(step({ expect: { type: 'url_matches', pattern: '/checkout/success' } })),
    ).toBe('URL matches: /checkout/success');
  });

  it('summarizes text_contains', () => {
    expect(
      expectSummary(step({ expect: { type: 'text_contains', text: 'Order confirmed' } })),
    ).toBe('text contains: Order confirmed');
  });
});

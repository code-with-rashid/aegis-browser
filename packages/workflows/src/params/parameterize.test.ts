import { describe, expect, it } from 'vitest';

import { toWorkflowStepId } from '../ids';
import type { WorkflowStep } from '../schema';
import { parameterizeSecret, parameterizeValue } from './parameterize';

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    stepId: toWorkflowStepId('step-1'),
    toolId: 'browser.input_text',
    args: { type: 'input_text', ref: 'ax:1', text: 'oat milk' },
    ...overrides,
  };
}

describe('parameterizeValue', () => {
  it('replaces the literal value with a param placeholder in args', () => {
    const { steps } = parameterizeValue([step()], { name: 'search_term', value: 'oat milk' });

    expect(steps[0]?.args).toEqual({
      type: 'input_text',
      ref: 'ax:1',
      text: '‹param:search_term›',
    });
  });

  it('returns a value-kind param with the literal as its default', () => {
    const { param } = parameterizeValue([step()], {
      name: 'search_term',
      value: 'oat milk',
      description: 'What to search for',
    });

    expect(param).toEqual({
      kind: 'value',
      name: 'search_term',
      defaultValue: 'oat milk',
      description: 'What to search for',
    });
  });

  it('replaces every occurrence across multiple steps', () => {
    const steps = [
      step({ stepId: toWorkflowStepId('step-1') }),
      step({
        stepId: toWorkflowStepId('step-2'),
        toolId: 'browser.extract',
        args: { type: 'extract', instructions: 'confirm oat milk was added' },
      }),
    ];

    const { steps: result } = parameterizeValue(steps, { name: 'search_term', value: 'oat milk' });

    expect(result[0]?.args).toMatchObject({ text: '‹param:search_term›' });
    expect(result[1]?.args).toMatchObject({
      instructions: 'confirm ‹param:search_term› was added',
    });
  });

  it('leaves steps that do not contain the literal value unchanged', () => {
    const other = step({
      stepId: toWorkflowStepId('step-2'),
      toolId: 'browser.click',
      args: { type: 'click', ref: 'ax:2' },
    });

    const { steps: result } = parameterizeValue([step(), other], {
      name: 'search_term',
      value: 'oat milk',
    });

    expect(result[1]?.args).toEqual({ type: 'click', ref: 'ax:2' });
  });
});

describe('parameterizeSecret', () => {
  it('replaces the literal value with a param placeholder in args', () => {
    const secretStep = step({ args: { type: 'input_text', ref: 'ax:1', text: 'hunter2' } });

    const { steps } = parameterizeSecret([secretStep], {
      name: 'login_password',
      value: 'hunter2',
      secretName: 'my_password',
    });

    expect(steps[0]?.args).toEqual({
      type: 'input_text',
      ref: 'ax:1',
      text: '‹param:login_password›',
    });
  });

  it('returns a secret-kind param referencing the vault secret, never the literal value', () => {
    const secretStep = step({ args: { type: 'input_text', ref: 'ax:1', text: 'hunter2' } });

    const { param } = parameterizeSecret([secretStep], {
      name: 'login_password',
      value: 'hunter2',
      secretName: 'my_password',
    });

    expect(param).toEqual({ kind: 'secret', name: 'login_password', secretName: 'my_password' });
    expect(JSON.stringify(param)).not.toContain('hunter2');
  });
});

import { toSecretPlaceholder } from '@aegis/security';
import { describe, expect, it } from 'vitest';

import { toWorkflowStepId } from '../ids';
import type { WorkflowParam, WorkflowStep } from '../schema';
import { toParamPlaceholder } from './param-placeholder';
import { resolveWorkflowParams, validateWorkflowParams } from './resolve-params';

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    stepId: toWorkflowStepId('step-1'),
    toolId: 'browser.input_text',
    args: { type: 'input_text', ref: 'ax:1', text: toParamPlaceholder('search_term') },
    ...overrides,
  };
}

describe('validateWorkflowParams', () => {
  it('passes when every referenced placeholder has a matching declared param', () => {
    const result = validateWorkflowParams({
      params: [{ kind: 'value', name: 'search_term', defaultValue: 'oat milk' }],
      steps: [step()],
    });
    expect(result.ok).toBe(true);
  });

  it('passes when a declared param is not yet referenced by any step', () => {
    const result = validateWorkflowParams({
      params: [
        { kind: 'value', name: 'search_term', defaultValue: 'oat milk' },
        { kind: 'value', name: 'unused_param' },
      ],
      steps: [step()],
    });
    expect(result.ok).toBe(true);
  });

  it('fails with PARAM_NOT_DECLARED when a step references an undeclared param', () => {
    const result = validateWorkflowParams({ params: [], steps: [step()] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('PARAM_NOT_DECLARED');
  });

  it('fails with PARAM_DUPLICATE when two params share a name', () => {
    const result = validateWorkflowParams({
      params: [
        { kind: 'value', name: 'search_term', defaultValue: 'a' },
        { kind: 'value', name: 'search_term', defaultValue: 'b' },
      ],
      steps: [],
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('PARAM_DUPLICATE');
  });
});

describe('resolveWorkflowParams', () => {
  it('substitutes a value-kind param with the caller-supplied value', () => {
    const params: WorkflowParam[] = [
      { kind: 'value', name: 'search_term', defaultValue: 'oat milk' },
    ];
    const result = resolveWorkflowParams([step()], params, { search_term: 'almond milk' });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value[0]?.args).toEqual({
      type: 'input_text',
      ref: 'ax:1',
      text: 'almond milk',
    });
  });

  it('falls back to the default value when the caller supplies none', () => {
    const params: WorkflowParam[] = [
      { kind: 'value', name: 'search_term', defaultValue: 'oat milk' },
    ];
    const result = resolveWorkflowParams([step()], params, {});

    expect(result.ok && result.value[0]?.args).toMatchObject({ text: 'oat milk' });
  });

  it('fails with PARAM_VALUE_MISSING when there is no supplied value and no default', () => {
    const params: WorkflowParam[] = [{ kind: 'value', name: 'search_term' }];
    const result = resolveWorkflowParams([step()], params, {});

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('PARAM_VALUE_MISSING');
  });

  it('substitutes a secret-kind param with a secret placeholder, never a raw value', () => {
    const secretStep = step({
      args: { type: 'input_text', ref: 'ax:1', text: toParamPlaceholder('login_password') },
    });
    const params: WorkflowParam[] = [
      { kind: 'secret', name: 'login_password', secretName: 'my_password' },
    ];

    const result = resolveWorkflowParams([secretStep], params, {});

    expect(result.ok).toBe(true);
    expect(result.ok && result.value[0]?.args).toEqual({
      type: 'input_text',
      ref: 'ax:1',
      text: toSecretPlaceholder('my_password'),
    });
  });

  it('resolves multiple distinct params across multiple steps', () => {
    const steps = [
      step(),
      step({
        stepId: toWorkflowStepId('step-2'),
        toolId: 'browser.click',
        args: { type: 'click', ref: 'ax:2' },
      }),
    ];
    const params: WorkflowParam[] = [
      { kind: 'value', name: 'search_term', defaultValue: 'oat milk' },
    ];

    const result = resolveWorkflowParams(steps, params, { search_term: 'almond milk' });

    expect(result.ok && result.value[0]?.args).toMatchObject({ text: 'almond milk' });
    expect(result.ok && result.value[1]?.args).toEqual({ type: 'click', ref: 'ax:2' });
  });
});

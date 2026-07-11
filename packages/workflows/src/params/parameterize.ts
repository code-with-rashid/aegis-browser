import type { WorkflowParam, WorkflowStep } from '../schema';
import { mapStringsDeep } from './map-strings-deep';
import { toParamPlaceholder } from './param-placeholder';

/** What a recorded step's literal value becomes a `value`-kind param. */
export interface ParameterizeValueInput {
  readonly name: string;
  /** The literal, recorded value to replace everywhere it appears — becomes the param's `defaultValue`, so an unchanged run still behaves exactly as recorded. */
  readonly value: string;
  readonly description?: string;
}

/** What a recorded step's literal value becomes a `secret`-kind param. */
export interface ParameterizeSecretInput {
  readonly name: string;
  /**
   * The literal, recorded value to replace everywhere it appears — used only to find and
   * remove it from `steps`; never stored anywhere in the returned `param` or `steps`. A
   * run that recorded a real credential typed directly (not already behind a `‹secret:›`
   * placeholder) must not leave that value sitting in persisted step data once
   * parameterized (`docs/adr/0044-workflow-parameterization.md`).
   */
  readonly value: string;
  /** Which vault secret this param resolves from at run time — resolution itself is deferred to the existing `resolveActionSecrets` pipeline, not this package's job. */
  readonly secretName: string;
  readonly description?: string;
}

function replaceLiteral(
  steps: readonly WorkflowStep[],
  literal: string,
  placeholder: string,
): readonly WorkflowStep[] {
  return steps.map((step) => ({
    ...step,
    args: mapStringsDeep(step.args, (text) => text.split(literal).join(placeholder)),
  }));
}

/** Replaces every occurrence of `input.value` across `steps` with a param placeholder, returning the rewritten steps and the `value`-kind `WorkflowParam` to register alongside them. */
export function parameterizeValue(
  steps: readonly WorkflowStep[],
  input: ParameterizeValueInput,
): { readonly steps: readonly WorkflowStep[]; readonly param: WorkflowParam } {
  const param: WorkflowParam = {
    kind: 'value',
    name: input.name,
    defaultValue: input.value,
    ...(input.description !== undefined ? { description: input.description } : {}),
  };
  return {
    steps: replaceLiteral(steps, input.value, toParamPlaceholder(input.name)),
    param,
  };
}

/** Replaces every occurrence of `input.value` across `steps` with a param placeholder, returning the rewritten steps and the `secret`-kind `WorkflowParam` to register alongside them. */
export function parameterizeSecret(
  steps: readonly WorkflowStep[],
  input: ParameterizeSecretInput,
): { readonly steps: readonly WorkflowStep[]; readonly param: WorkflowParam } {
  const param: WorkflowParam = {
    kind: 'secret',
    name: input.name,
    secretName: input.secretName,
    ...(input.description !== undefined ? { description: input.description } : {}),
  };
  return {
    steps: replaceLiteral(steps, input.value, toParamPlaceholder(input.name)),
    param,
  };
}

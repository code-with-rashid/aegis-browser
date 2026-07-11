import { toSecretPlaceholder } from '@aegis/security';
import { err, ok, type Result } from '@aegis/shared';

import { WorkflowError } from '../errors';
import type { Workflow, WorkflowParam, WorkflowStep } from '../schema';
import { mapStringsDeep } from './map-strings-deep';
import { findParamPlaceholderNames, toParamPlaceholder } from './param-placeholder';

function placeholderNamesIn(args: unknown): ReadonlySet<string> {
  const names = new Set<string>();
  mapStringsDeep(args, (text) => {
    for (const name of findParamPlaceholderNames(text)) {
      names.add(name);
    }
    return text;
  });
  return names;
}

/**
 * Checks that a workflow's declared `params` and the placeholders its `steps` actually
 * reference agree in both directions: every placeholder in `steps` has a matching
 * declared param (`PARAM_NOT_DECLARED` otherwise — a step referencing a param that was
 * removed, or never added), and no two params share a name (`PARAM_DUPLICATE`). Does
 * *not* require every declared param to be referenced — a param added ahead of finishing
 * an edit isn't an error.
 */
export function validateWorkflowParams(
  workflow: Pick<Workflow, 'params' | 'steps'>,
): Result<void, WorkflowError> {
  const declaredNames = new Set<string>();
  for (const param of workflow.params) {
    if (declaredNames.has(param.name)) {
      return err(
        new WorkflowError('PARAM_DUPLICATE', `Param "${param.name}" is declared more than once`),
      );
    }
    declaredNames.add(param.name);
  }

  for (const step of workflow.steps) {
    for (const name of placeholderNamesIn(step.args)) {
      if (!declaredNames.has(name)) {
        return err(
          new WorkflowError(
            'PARAM_NOT_DECLARED',
            `Step "${step.stepId}" references param "${name}", which is not declared`,
          ),
        );
      }
    }
  }

  return ok(undefined);
}

/**
 * Produces the final, concrete `steps` a deterministic run (#111) executes: every
 * `value`-kind param's placeholder is replaced with `values[param.name]` (falling back to
 * `param.defaultValue` when the caller didn't supply one — `PARAM_VALUE_MISSING` if
 * neither exists), and every `secret`-kind param's placeholder is replaced with
 * `toSecretPlaceholder(param.secretName)` — **not** a real secret value. The real value is
 * resolved later, by the existing `resolveActionSecrets` pipeline immediately before
 * native fill (`docs/adr/0012-secret-vault.md`) — this function never touches a
 * `SecretVault` at all, so a resolved step's `args` still never contains a real secret,
 * only ever a `‹secret:name›` reference (`docs/adr/0044-workflow-parameterization.md`).
 */
export function resolveWorkflowParams(
  steps: readonly WorkflowStep[],
  params: readonly WorkflowParam[],
  values: Readonly<Record<string, string>>,
): Result<readonly WorkflowStep[], WorkflowError> {
  const substitutions = new Map<string, string>();
  for (const param of params) {
    if (param.kind === 'secret') {
      substitutions.set(param.name, toSecretPlaceholder(param.secretName));
      continue;
    }
    const value = values[param.name] ?? param.defaultValue;
    if (value === undefined) {
      return err(
        new WorkflowError(
          'PARAM_VALUE_MISSING',
          `No value supplied for param "${param.name}", and it has no default`,
        ),
      );
    }
    substitutions.set(param.name, value);
  }

  const resolvedSteps = steps.map((step) => ({
    ...step,
    args: mapStringsDeep(step.args, (text) => {
      let resolved = text;
      for (const [name, value] of substitutions) {
        resolved = resolved.split(toParamPlaceholder(name)).join(value);
      }
      return resolved;
    }),
  }));

  return ok(resolvedSteps);
}

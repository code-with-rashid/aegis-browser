import type { WorkflowParam, WorkflowParamKind } from '@aegis/workflows';

/** A blank starting point for a newly-added param — the user fills in a real name before saving. */
export function newParam(kind: WorkflowParamKind): WorkflowParam {
  return kind === 'value'
    ? { kind: 'value', name: '' }
    : { kind: 'secret', name: '', secretName: '' };
}

export function addParam(
  params: readonly WorkflowParam[],
  kind: WorkflowParamKind,
): WorkflowParam[] {
  return [...params, newParam(kind)];
}

export function removeParamAt(params: readonly WorkflowParam[], index: number): WorkflowParam[] {
  return params.filter((_param, i) => i !== index);
}

/** Switching kind resets the fields unique to the other kind — a `value`'s `defaultValue` and a `secret`'s `secretName` never carry over, since they mean different things. */
export function changeParamKindAt(
  params: readonly WorkflowParam[],
  index: number,
  kind: WorkflowParamKind,
): WorkflowParam[] {
  return params.map((param, i) => {
    if (i !== index || param.kind === kind) {
      return param;
    }
    const shared = {
      name: param.name,
      ...(param.description !== undefined ? { description: param.description } : {}),
    };
    return kind === 'value'
      ? { kind: 'value', ...shared }
      : { kind: 'secret', ...shared, secretName: '' };
  });
}

export function updateParamFieldAt(
  params: readonly WorkflowParam[],
  index: number,
  field: 'name' | 'description',
  value: string,
): WorkflowParam[] {
  return params.map((param, i) => {
    if (i !== index) {
      return param;
    }
    return { ...param, [field]: value };
  });
}

export function updateValueDefaultAt(
  params: readonly WorkflowParam[],
  index: number,
  defaultValue: string,
): WorkflowParam[] {
  return params.map((param, i) => {
    if (i !== index || param.kind !== 'value') {
      return param;
    }
    return { ...param, defaultValue };
  });
}

export function updateSecretNameAt(
  params: readonly WorkflowParam[],
  index: number,
  secretName: string,
): WorkflowParam[] {
  return params.map((param, i) => {
    if (i !== index || param.kind !== 'secret') {
      return param;
    }
    return { ...param, secretName };
  });
}

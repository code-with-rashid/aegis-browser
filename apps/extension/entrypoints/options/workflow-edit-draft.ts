import type { Workflow, WorkflowParam } from '@aegis/workflows';

/**
 * In-progress fields for editing a workflow's own metadata (#118) — deliberately just
 * `name` and each `value`-kind param's `defaultValue`. Editing the recorded `steps`
 * themselves is #119's job ("Workflow builder/editor"); a `secret`-kind param has no
 * editable value here at all — it only ever carries a vault reference, never a value.
 */
export interface WorkflowEditDraft {
  readonly name: string;
  /** Keyed by param name — only `value`-kind params appear here. */
  readonly paramDefaults: Readonly<Record<string, string>>;
}

export function draftFromWorkflow(workflow: Workflow): WorkflowEditDraft {
  return {
    name: workflow.name,
    paramDefaults: Object.fromEntries(
      workflow.params
        .filter(
          (param): param is Extract<WorkflowParam, { kind: 'value' }> => param.kind === 'value',
        )
        .map((param) => [param.name, param.defaultValue ?? '']),
    ),
  };
}

/** Validates a {@link WorkflowEditDraft} into a `WorkflowPatch`-ready `{name, params}` pair, or `undefined` if the name is blank. */
export function toWorkflowEdits(
  draft: WorkflowEditDraft,
  workflow: Workflow,
): { name: string; params: WorkflowParam[] } | undefined {
  const name = draft.name.trim();
  if (name.length === 0) {
    return undefined;
  }

  const params = workflow.params.map((param): WorkflowParam => {
    if (param.kind !== 'value') {
      return param;
    }
    const defaultValue = draft.paramDefaults[param.name]?.trim();
    const { defaultValue: _existingDefault, ...rest } = param;
    return defaultValue !== undefined && defaultValue.length > 0 ? { ...rest, defaultValue } : rest;
  });

  return { name, params };
}

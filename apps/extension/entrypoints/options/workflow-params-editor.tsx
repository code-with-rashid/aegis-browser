import type { WorkflowParam, WorkflowParamKind } from '@aegis/workflows';

import { Button } from '@/components/ui/button';

import {
  addParam,
  changeParamKindAt,
  removeParamAt,
  updateParamFieldAt,
  updateSecretNameAt,
  updateValueDefaultAt,
} from './workflow-params-editor-actions';

export interface WorkflowParamsEditorProps {
  readonly params: readonly WorkflowParam[];
  readonly onChange: (params: WorkflowParam[]) => void;
}

/** Add/remove a param, switch its kind, and edit its name/description/default/secretName (#119) — a fuller CRUD surface than #118's inline "edit a value param's default only". */
export function WorkflowParamsEditor({
  params,
  onChange,
}: WorkflowParamsEditorProps): React.JSX.Element {
  return (
    <div className="space-y-2">
      {params.length === 0 ? (
        <p className="text-xs text-muted-foreground">This workflow has no params.</p>
      ) : (
        <ul className="space-y-2">
          {params.map((param, index) => (
            <li key={index} className="space-y-1 rounded bg-muted p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1">
                  Kind
                  <select
                    aria-label={`Param ${index + 1} kind`}
                    className="rounded border border-border bg-background p-1"
                    value={param.kind}
                    onChange={(event) => {
                      onChange(
                        changeParamKindAt(params, index, event.target.value as WorkflowParamKind),
                      );
                    }}
                  >
                    <option value="value">value</option>
                    <option value="secret">secret</option>
                  </select>
                </label>
                <input
                  aria-label={`Param ${index + 1} name`}
                  placeholder="Name"
                  className="min-w-[8rem] flex-1 rounded border border-border bg-background p-1"
                  value={param.name}
                  onChange={(event) => {
                    onChange(updateParamFieldAt(params, index, 'name', event.target.value));
                  }}
                />
                <input
                  aria-label={`Param ${index + 1} description`}
                  placeholder="Description (optional)"
                  className="min-w-[10rem] flex-1 rounded border border-border bg-background p-1"
                  value={param.description ?? ''}
                  onChange={(event) => {
                    onChange(updateParamFieldAt(params, index, 'description', event.target.value));
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onChange(removeParamAt(params, index));
                  }}
                >
                  Remove
                </Button>
              </div>
              {param.kind === 'value' ? (
                <input
                  aria-label={`Param ${index + 1} default value`}
                  placeholder="Default value (optional)"
                  className="block w-full rounded border border-border bg-background p-1"
                  value={param.defaultValue ?? ''}
                  onChange={(event) => {
                    onChange(updateValueDefaultAt(params, index, event.target.value));
                  }}
                />
              ) : (
                <input
                  aria-label={`Param ${index + 1} secret name`}
                  placeholder="Vault secret name"
                  className="block w-full rounded border border-border bg-background p-1"
                  value={param.secretName}
                  onChange={(event) => {
                    onChange(updateSecretNameAt(params, index, event.target.value));
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange(addParam(params, 'value'));
          }}
        >
          Add value param
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange(addParam(params, 'secret'));
          }}
        >
          Add secret param
        </Button>
      </div>
    </div>
  );
}

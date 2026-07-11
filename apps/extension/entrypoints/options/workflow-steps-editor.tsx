import type { WorkflowStep } from '@aegis/workflows';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

import {
  expectSummary,
  moveStepDown,
  moveStepUp,
  removeStepAt,
  targetSummary,
} from './workflow-steps-editor-actions';

function ArgsView({ args }: { args: unknown }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      {' '}
      <button
        type="button"
        className="text-muted-foreground underline"
        onClick={() => {
          setExpanded((current) => !current);
        }}
      >
        {expanded ? 'Hide' : 'Show'} args
      </button>
      {expanded ? (
        <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px]">
          {JSON.stringify(args, null, 2)}
        </pre>
      ) : null}
    </>
  );
}

export interface WorkflowStepsEditorProps {
  readonly steps: readonly WorkflowStep[];
  readonly onChange: (steps: WorkflowStep[]) => void;
}

/**
 * View/reorder/delete a workflow's recorded steps (#119) — a step's own `args`/`target`/
 * `expect` are read-only here (`workflow-steps-editor-actions.ts`'s own doc comment):
 * they're exactly what was recorded and replayed, and editing them is a materially
 * different, bigger feature this issue doesn't attempt.
 */
export function WorkflowStepsEditor({
  steps,
  onChange,
}: WorkflowStepsEditorProps): React.JSX.Element {
  if (steps.length === 0) {
    return <p className="text-xs text-muted-foreground">This workflow has no steps.</p>;
  }

  return (
    <ol className="space-y-1 text-xs">
      {steps.map((step, index) => {
        const target = targetSummary(step);
        const expect = expectSummary(step);
        return (
          <li key={step.stepId} className="rounded bg-muted p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">
                {index + 1}. {step.toolId}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index === 0}
                aria-label={`Move step ${index + 1} up`}
                onClick={() => {
                  onChange(moveStepUp(steps, index));
                }}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index === steps.length - 1}
                aria-label={`Move step ${index + 1} down`}
                onClick={() => {
                  onChange(moveStepDown(steps, index));
                }}
              >
                ↓
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Delete step ${index + 1}`}
                onClick={() => {
                  onChange(removeStepAt(steps, index));
                }}
              >
                Delete
              </Button>
            </div>
            {target !== undefined ? (
              <p className="text-muted-foreground">Target: {target}</p>
            ) : null}
            {expect !== undefined ? (
              <p className="text-muted-foreground">Expect: {expect}</p>
            ) : null}
            <ArgsView args={step.args} />
          </li>
        );
      })}
    </ol>
  );
}

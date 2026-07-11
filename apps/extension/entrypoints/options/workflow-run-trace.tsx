import type { WorkflowStepResult } from '@aegis/workflows';
import { useState } from 'react';

function OutputView({ output }: { output: unknown }): React.JSX.Element {
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
        {expanded ? 'Hide' : 'Show'} output
      </button>
      {expanded ? (
        <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px]">
          {JSON.stringify(output, null, 2)}
        </pre>
      ) : null}
    </>
  );
}

function StepView({ step }: { step: WorkflowStepResult }): React.JSX.Element {
  return (
    <li className={step.succeeded ? '' : 'text-red-600'}>
      {step.succeeded ? 'OK' : 'FAILED'} — {step.toolId}
      {step.errorMessage !== undefined ? `: ${step.errorMessage}` : ''}
      {step.output !== undefined ? <OutputView output={step.output} /> : null}
    </li>
  );
}

/**
 * Renders one background run's step-by-step trace (#118) — the workflow-run analog of
 * the side panel's `TraceList` (#26), but for a genuinely different data shape:
 * `WorkflowStepResult` (`stepId`/`toolId`/`succeeded`/`errorMessage`/`output`) has no
 * planner/navigator/verifier reasoning or per-step perception, since a deterministic
 * replay never calls a planner at all — reusing `TraceList` itself isn't possible, so
 * this is a sibling component with the same "Show/Hide" progressive-disclosure
 * convention rather than a shared one.
 */
export function WorkflowRunTrace({
  steps,
}: {
  steps: readonly WorkflowStepResult[];
}): React.JSX.Element | null {
  if (steps.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 space-y-1 text-xs">
      {steps.map((step, index) => (
        <StepView key={`${step.stepId}-${index}`} step={step} />
      ))}
    </ul>
  );
}

import type { TraceStep } from '@aegis/agent';
import { useState } from 'react';

import { cn } from '@/lib/utils';

const OUTCOME_LABEL: Record<string, string> = {
  achieved: 'Achieved',
  continue: 'Continuing',
  failed: 'Failed',
};

function TraceActionView({ action }: { action: TraceStep['actions'][number] }): React.JSX.Element {
  const [detailExpanded, setDetailExpanded] = useState(false);

  return (
    <li className={action.succeeded ? '' : 'text-red-600'}>
      {action.succeeded ? 'OK' : 'FAILED'}
      {action.source !== undefined && action.source !== 'browser' ? (
        <span className="mx-1 rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">
          {action.source}
        </span>
      ) : (
        ' '
      )}
      — {action.description}
      {action.errorMessage !== undefined ? `: ${action.errorMessage}` : ''}
      {action.estimatedDomStepsSaved !== undefined ? (
        <span className="text-muted-foreground">
          {' '}
          (~{action.estimatedDomStepsSaved} DOM steps saved)
        </span>
      ) : null}
      {action.argsSummary !== undefined ? (
        <>
          {' '}
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => {
              setDetailExpanded((expanded) => !expanded);
            }}
          >
            {detailExpanded ? 'Hide' : 'Show'} args
          </button>
          {detailExpanded ? (
            <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px]">
              <span>{action.toolId}</span>
              {'\n'}
              <span>{action.argsSummary}</span>
            </pre>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

function TraceStepView({ step }: { step: TraceStep }): React.JSX.Element {
  const [perceptionExpanded, setPerceptionExpanded] = useState(false);

  return (
    <li className="rounded-md border border-border p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          Step {step.stepNumber}: {step.subGoal}
        </span>
        {step.verifyOutcome !== undefined ? (
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
              step.verifyOutcome === 'failed' && 'bg-red-100 text-red-700',
              step.verifyOutcome === 'achieved' && 'bg-green-100 text-green-700',
              step.verifyOutcome === 'continue' && 'bg-blue-100 text-blue-700',
            )}
          >
            {OUTCOME_LABEL[step.verifyOutcome] ?? step.verifyOutcome}
          </span>
        ) : null}
      </div>

      {step.plannerReasoning !== undefined ? (
        <p className="mt-1 text-muted-foreground">Plan: {step.plannerReasoning}</p>
      ) : null}
      {step.navigatorReasoning !== undefined ? (
        <p className="text-muted-foreground">Why: {step.navigatorReasoning}</p>
      ) : null}

      <ul className="mt-1 space-y-0.5">
        {step.actions.map((action, index) => (
          <TraceActionView key={index} action={action} />
        ))}
      </ul>

      {step.verifierReasoning !== undefined ? (
        <p className="mt-1 text-muted-foreground">Verify: {step.verifierReasoning}</p>
      ) : null}

      {step.perception !== undefined ? (
        <div className="mt-1">
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => {
              setPerceptionExpanded((expanded) => !expanded);
            }}
          >
            {perceptionExpanded ? 'Hide' : 'Show'} raw perception
          </button>
          {perceptionExpanded ? (
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px]">
              {JSON.stringify(step.perception, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Renders a run's trace: a live-updating timeline while the run is active, or a replay
 * of a completed run's steps once it's done — both are just this same list rendering
 * whatever `steps` currently holds (#26, `docs/adr/0014-action-trace-log-ui.md`).
 */
export function TraceList({ steps }: { steps: readonly TraceStep[] }): React.JSX.Element | null {
  if (steps.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 space-y-2">
      {steps.map((step) => (
        <TraceStepView key={step.stepNumber} step={step} />
      ))}
    </ul>
  );
}

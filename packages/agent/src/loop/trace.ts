import { describeAction } from './confirmation';
import type { AgentLoopContext } from './machine';
import type { VerifyOutcome } from './services';

/** One executed action within a {@link TraceStep} — a human-readable description (reusing {@link describeAction}), not the raw `Action`. */
export interface TraceActionEntry {
  readonly description: string;
  readonly succeeded: boolean;
  readonly errorMessage: string | undefined;
}

/**
 * One full plan → perceive → decide → act → verify cycle, as the trace UI (#26) renders
 * it: the sub-goal being pursued, the reasoning behind the plan/action/verdict, what ran
 * and its result, and the perception it was all based on (shown collapsed/expandable).
 */
export interface TraceStep {
  readonly stepNumber: number;
  readonly subGoal: string;
  readonly plannerReasoning: string | undefined;
  readonly navigatorReasoning: string | undefined;
  readonly actions: readonly TraceActionEntry[];
  readonly verifyOutcome: VerifyOutcome | undefined;
  readonly verifierReasoning: string | undefined;
  readonly perception: AgentLoopContext['perception'];
}

/**
 * Builds one {@link TraceStep} from a snapshot's context, right after `verifying`
 * resolves (`context.lastRunSummary` is only ever set by a just-completed `acting` run).
 * Returns `undefined` when there's nothing to report yet — e.g. the very first
 * `planning` pass, before any action has run.
 */
export function buildTraceStep(
  context: AgentLoopContext,
  stepNumber: number,
): TraceStep | undefined {
  if (context.lastRunSummary === undefined) {
    return undefined;
  }

  const actions: TraceActionEntry[] = context.lastRunSummary.toolCalls.map((outcome, index) => {
    const action = context.proposedActions[index];
    return {
      description:
        action !== undefined ? describeAction(action, context.perception) : outcome.toolId,
      succeeded: outcome.succeeded,
      errorMessage: outcome.errorMessage,
    };
  });

  return {
    stepNumber,
    subGoal: context.subGoal ?? context.task,
    plannerReasoning: context.plannerReasoning,
    navigatorReasoning: context.navigatorReasoning,
    actions,
    verifyOutcome: context.verifyOutcome,
    verifierReasoning: context.verifierReasoning,
    perception: context.perception,
  };
}

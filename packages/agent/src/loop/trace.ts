import type { ToolRegistry, ToolSource } from '@aegis/actions';

import { identitySanitize, type SanitizeText } from '../sanitize';
import { describeToolCall, summarizeArgs } from './confirmation';
import type { AgentLoopContext } from './machine';
import type { PolicyDecision, VerifyOutcome } from './services';

/**
 * A fixed, documented estimate — not a measurement — of how many DOM actions (click,
 * type, wait, ...) a single successful declared-tool call (`mcp`/`webmcp`) likely
 * replaced. There's no way to know the actual number without also running the DOM path,
 * which defeats the point of preferring the tool (#88); this constant exists purely to
 * make the savings visible in the trace, not to claim precision.
 */
const ESTIMATED_DOM_STEPS_PER_DECLARED_TOOL_CALL = 3;

/** One executed tool call within a {@link TraceStep} — a human-readable description (via {@link describeToolCall}) plus enough structured detail (id, source, args) to audit it, whatever its source. */
export interface TraceActionEntry {
  readonly toolId: string;
  /** `undefined` only if the tool was somehow unregistered by the time the trace was built. */
  readonly source: ToolSource | undefined;
  readonly description: string;
  readonly argsSummary: string | undefined;
  readonly succeeded: boolean;
  readonly errorMessage: string | undefined;
  /** Set only for a successful `mcp`/`webmcp` call — `ESTIMATED_DOM_STEPS_PER_DECLARED_TOOL_CALL`, a fixed estimate of the DOM steps this call likely replaced (#88). `undefined` for a browser action or a failed call. */
  readonly estimatedDomStepsSaved: number | undefined;
}

/**
 * One full plan → perceive → decide → act → verify cycle, as the trace UI (#26) renders
 * it: the sub-goal being pursued, the reasoning behind the plan/action/verdict, what ran
 * and its result, the security policy's decision for this step's tool calls (#86), and
 * the perception it was all based on (shown collapsed/expandable).
 */
export interface TraceStep {
  readonly stepNumber: number;
  readonly subGoal: string;
  readonly plannerReasoning: string | undefined;
  readonly navigatorReasoning: string | undefined;
  readonly actions: readonly TraceActionEntry[];
  readonly policyDecision: PolicyDecision | undefined;
  readonly verifyOutcome: VerifyOutcome | undefined;
  readonly verifierReasoning: string | undefined;
  readonly perception: AgentLoopContext['perception'];
}

/**
 * Builds one {@link TraceStep} from a snapshot's context, right after `verifying`
 * resolves (`context.lastRunSummary` is only ever set by a just-completed `acting` run).
 * Returns `undefined` when there's nothing to report yet — e.g. the very first
 * `planning` pass, before any action has run.
 *
 * Correlates each outcome in `context.lastRunSummary.toolCalls` with
 * `context.proposedToolCalls` by index — never `context.proposedActions`, which only ever
 * holds the browser-`Action` subset (#85/#86) and would silently misalign against a batch
 * that mixes browser and MCP/WebMCP tool calls.
 */
export function buildTraceStep(
  context: AgentLoopContext,
  stepNumber: number,
  toolRegistry: ToolRegistry,
  sanitize: SanitizeText = identitySanitize,
): TraceStep | undefined {
  if (context.lastRunSummary === undefined) {
    return undefined;
  }

  const actions: TraceActionEntry[] = context.lastRunSummary.toolCalls.map((outcome, index) => {
    const toolCall = context.proposedToolCalls[index];
    const source = toolRegistry.get(outcome.toolId)?.source;
    const isDeclaredTool = source === 'mcp' || source === 'webmcp';
    return {
      toolId: outcome.toolId,
      source,
      description:
        toolCall !== undefined
          ? describeToolCall(toolCall, toolRegistry, context.perception, sanitize)
          : outcome.toolId,
      argsSummary: toolCall !== undefined ? summarizeArgs(toolCall.args) : undefined,
      succeeded: outcome.succeeded,
      errorMessage: outcome.errorMessage,
      estimatedDomStepsSaved:
        isDeclaredTool && outcome.succeeded
          ? ESTIMATED_DOM_STEPS_PER_DECLARED_TOOL_CALL
          : undefined,
    };
  });

  return {
    stepNumber,
    subGoal: context.subGoal ?? context.task,
    plannerReasoning: context.plannerReasoning,
    navigatorReasoning: context.navigatorReasoning,
    actions,
    policyDecision: context.policyDecision,
    verifyOutcome: context.verifyOutcome,
    verifierReasoning: context.verifierReasoning,
    perception: context.perception,
  };
}

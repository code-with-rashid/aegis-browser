import type { Action, ExecutorContext, ToolResult } from '@aegis/actions';
import type { CdpError, CdpSession, PerceptionPayload } from '@aegis/perception';
import type { Result } from '@aegis/shared';

import type { AgentError } from './errors';

/**
 * The agent loop's collaborators, injected rather than imported directly so the state
 * machine itself is pure and testable with mocks (#15's acceptance criteria). Real
 * implementations arrive in later issues: {@link PlannerService} (#16),
 * {@link NavigatorService} (#17), {@link VerifierService} (#18), {@link PolicyService}
 * (#21), {@link CriticService} (#23). {@link PerceiveService}/{@link ActService} wrap the
 * already-built perception (#10) and action-runner (#14) pipelines.
 */
export interface LoopServices {
  readonly perceive: PerceiveService;
  readonly plan: PlannerService;
  readonly decide: NavigatorService;
  readonly checkPolicy: PolicyService;
  readonly checkAlignment: CriticService;
  readonly act: ActService;
  readonly verify: VerifierService;
}

export interface PerceiveInput {
  readonly session: CdpSession;
  readonly goal: string;
}
/** `signal` fires when the loop is stopped mid-step (#19) — honor it if the implementation can. */
export type PerceiveService = (
  input: PerceiveInput,
  signal?: AbortSignal,
) => Promise<Result<PerceptionPayload, CdpError>>;

export interface PlanInput {
  readonly task: string;
  readonly perception: PerceptionPayload | undefined;
  /** Prior sub-goals attempted this task, oldest first — context for avoiding repeats. */
  readonly subGoalHistory: readonly string[];
}
export interface PlanOutput {
  readonly subGoal: string;
  readonly taskComplete: boolean;
  readonly summary?: string;
  /** The full remaining plan and the planner's reasoning/memory — for the trace UI (#26); the machine only reads the fields above. */
  readonly plan?: readonly string[];
  readonly reasoning?: string;
  readonly memory?: string;
}
export type PlannerService = (
  input: PlanInput,
  signal?: AbortSignal,
) => Promise<Result<PlanOutput, AgentError>>;

export interface DecideInput {
  /** The user's original, trusted task — grounding for literal values (codes, search
   * terms, exact strings) that a Planner-paraphrased `subGoal` may not restate. */
  readonly task: string;
  readonly subGoal: string;
  readonly perception: PerceptionPayload;
}

/** One call the Navigator chose to make — a tool `id` (`Tool.id`, `@aegis/actions`) plus its already-validated `args` (per that tool's `inputSchema`). */
export interface ToolCall {
  readonly toolId: string;
  readonly args: unknown;
}

export interface DecideOutput {
  /**
   * The browser-`Action` view of `toolCalls` — only entries backed by a
   * `source: "browser"` tool, re-parsed through the real (branded) action schemas. Feeds
   * the policy engine, alignment critic, confirmation UI, and trace, none of which are
   * tool-call-aware yet (#82, #90). Always the full list today (every registered tool is
   * `source: "browser"` until #85/#87 register others) — will be a subset once MCP/WebMCP
   * tools are live.
   */
  readonly actions: readonly Action[];
  /**
   * The authoritative decision — every tool call, from any source. `optional` so services
   * and tests that only ever dealt in browser `Action`s can keep constructing a
   * `DecideOutput` from `actions` alone; the loop machine derives `toolCalls` from
   * `actions` (via {@link actionToToolCall}) when this is omitted.
   */
  readonly toolCalls?: readonly ToolCall[];
  /** True when the navigator can't find an actionable next step — triggers a replan. */
  readonly stuck: boolean;
  /** The navigator's observation/reasoning/memory — for the trace UI (#26); the machine only reads the fields above. */
  readonly observation?: string;
  readonly reasoning?: string;
  readonly memory?: string;
}
export type NavigatorService = (
  input: DecideInput,
  signal?: AbortSignal,
) => Promise<Result<DecideOutput, AgentError>>;

/** `browser.<action.type>`, with `args` the action itself — the inverse of how a browser tool call's `args` already double as a real `Action` (`@aegis/actions`' `browser-tools.ts`). Used to keep `toolCalls` in lockstep whenever `actions` changes outside the Navigator (e.g. a human `EDIT` during confirmation). */
export function actionToToolCall(action: Action): ToolCall {
  return { toolId: `browser.${action.type}`, args: action };
}

export interface PolicyCheckInput {
  /** Every tool call this turn, from any source — routed through the security policy engine regardless of where the tool came from (Phase 2, #82). */
  readonly toolCalls: readonly ToolCall[];
  /** The perception the tool calls were proposed against — lets the policy service resolve a browser tool call's target element name for risk elevation (e.g. a button literally named "Buy Now"). Optional so existing callers/tests that don't need it can omit it entirely. */
  readonly perception?: PerceptionPayload;
}
/**
 * `allow`: run the actions unsupervised. `confirm`: suspend the loop and ask the human
 * (`docs/adr/0010-confirmation-gate.md`). `deny`: the policy engine (`@aegis/security`,
 * #21) blocked this outright (e.g. a hard deny-listed origin) — no human can override it
 * from inside the loop, so the machine replans instead of asking.
 */
export type PolicyDecision = 'allow' | 'confirm' | 'deny';
export interface PolicyCheckOutput {
  readonly decision: PolicyDecision;
  readonly reason?: string;
}
export type PolicyService = (
  input: PolicyCheckInput,
  signal?: AbortSignal,
) => Promise<Result<PolicyCheckOutput, AgentError>>;

export interface CriticCheckInput {
  /** The user's original, trusted task — what alignment is judged against. */
  readonly task: string;
  readonly subGoal: string;
  /** Every tool call the policy engine flagged `confirm` — from any source (Phase 2, #82). */
  readonly toolCalls: readonly ToolCall[];
  readonly perception: PerceptionPayload | undefined;
}
export interface CriticCheckOutput {
  /** False when the action appears induced by page content rather than the user's intent. */
  readonly aligned: boolean;
  readonly reasoning: string;
}
/**
 * The alignment critic (`docs/DESIGN.md` §7.2): an independent second pass, run only on
 * actions the policy engine already flagged `confirm`, asking whether they serve the
 * user's original intent or look induced by the page. Runs before the human ever sees a
 * confirmation preview — a misaligned action is blocked and explained instead.
 */
export type CriticService = (
  input: CriticCheckInput,
  signal?: AbortSignal,
) => Promise<Result<CriticCheckOutput, AgentError>>;

/** One executed tool call, capturing which attempt succeeded (or that all attempts failed). */
export interface ToolCallRunResult {
  readonly toolCall: ToolCall;
  readonly attempt: number;
  readonly outcome: ToolResult;
}

/** The outcome of running a batch of tool calls — the tool-call generalization of `@aegis/actions`' `RunOutcome`. */
export type ToolRunOutcome =
  | { readonly kind: 'completed'; readonly results: readonly ToolCallRunResult[] }
  | {
      readonly kind: 'failed';
      readonly results: readonly ToolCallRunResult[];
      readonly failedToolCall: ToolCall;
    }
  | {
      readonly kind: 'stalled';
      readonly results: readonly ToolCallRunResult[];
      readonly stalledOn: ToolCall;
    }
  | { readonly kind: 'aborted'; readonly results: readonly ToolCallRunResult[] };

export type ActService = (
  toolCalls: readonly ToolCall[],
  context: ExecutorContext,
  signal?: AbortSignal,
) => Promise<ToolRunOutcome>;

/** A plain-data summary of one attempted tool call — safe to persist (no `Error` instances). */
export interface ToolCallOutcomeSummary {
  readonly toolId: string;
  readonly succeeded: boolean;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

/** A plain-data summary of a whole {@link ToolRunOutcome} — what the verifier/UI need, nothing more. */
export interface RunSummary {
  readonly kind: ToolRunOutcome['kind'];
  readonly toolCalls: readonly ToolCallOutcomeSummary[];
}

export interface VerifyInput {
  /** The overall user task — needed to judge `taskComplete`, not just this sub-goal. */
  readonly task: string;
  readonly subGoal: string;
  /** Perception taken AFTER acting — verification always looks at fresh, post-action state. */
  readonly perception: PerceptionPayload;
  /** A plain-data summary of the just-completed run (see `run-summary.ts`), not the raw `ToolRunOutcome`. */
  readonly runSummary: RunSummary;
}
/**
 * `achieved`: the sub-goal was met (check `taskComplete` for whether the whole task is
 * now done too). `continue`: actions ran fine but the sub-goal isn't visibly met yet —
 * try again. `failed`: this sub-goal attempt hit a dead end (e.g. the actions themselves
 * errored) — replan rather than keep repeating the same approach.
 */
export type VerifyOutcome = 'achieved' | 'continue' | 'failed';
export interface VerifyOutput {
  readonly outcome: VerifyOutcome;
  readonly taskComplete: boolean;
  /** The verifier's reasoning — for the trace UI (#26); the machine only reads the fields above. */
  readonly reasoning?: string;
}
export type VerifierService = (
  input: VerifyInput,
  signal?: AbortSignal,
) => Promise<Result<VerifyOutput, AgentError>>;

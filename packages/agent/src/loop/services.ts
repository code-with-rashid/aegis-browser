import type { Action, ExecutorContext, RunOutcome } from '@aegis/actions';
import type { CdpError, CdpSession, PerceptionPayload } from '@aegis/perception';
import type { Result } from '@aegis/shared';

import type { AgentError } from './errors';
import type { RunSummary } from './run-summary';

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
  readonly subGoal: string;
  readonly perception: PerceptionPayload;
}
export interface DecideOutput {
  readonly actions: readonly Action[];
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

export interface PolicyCheckInput {
  readonly actions: readonly Action[];
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
  readonly actions: readonly Action[];
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

export type ActService = (
  actions: readonly Action[],
  context: ExecutorContext,
  signal?: AbortSignal,
) => Promise<RunOutcome>;

export interface VerifyInput {
  /** The overall user task — needed to judge `taskComplete`, not just this sub-goal. */
  readonly task: string;
  readonly subGoal: string;
  /** Perception taken AFTER acting — verification always looks at fresh, post-action state. */
  readonly perception: PerceptionPayload;
  /** A plain-data summary of the just-completed run (see `run-summary.ts`), not the raw `RunOutcome`. */
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

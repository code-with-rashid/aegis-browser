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
 * (#21). {@link PerceiveService}/{@link ActService} wrap the already-built perception
 * (#10) and action-runner (#14) pipelines.
 */
export interface LoopServices {
  readonly perceive: PerceiveService;
  readonly plan: PlannerService;
  readonly decide: NavigatorService;
  readonly checkPolicy: PolicyService;
  readonly act: ActService;
  readonly verify: VerifierService;
}

export interface PerceiveInput {
  readonly session: CdpSession;
  readonly goal: string;
}
export type PerceiveService = (
  input: PerceiveInput,
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
export type PlannerService = (input: PlanInput) => Promise<Result<PlanOutput, AgentError>>;

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
export type NavigatorService = (input: DecideInput) => Promise<Result<DecideOutput, AgentError>>;

export interface PolicyCheckInput {
  readonly actions: readonly Action[];
}
export interface PolicyCheckOutput {
  readonly requiresConfirmation: boolean;
  readonly reason?: string;
}
export type PolicyService = (
  input: PolicyCheckInput,
) => Promise<Result<PolicyCheckOutput, AgentError>>;

export type ActService = (
  actions: readonly Action[],
  context: ExecutorContext,
) => Promise<RunOutcome>;

export interface VerifyInput {
  readonly subGoal: string;
  readonly perception: PerceptionPayload;
  /** A plain-data summary of the just-completed run (see `run-summary.ts`), not the raw `RunOutcome`. */
  readonly runSummary: RunSummary;
}
export interface VerifyOutput {
  readonly subGoalComplete: boolean;
  readonly taskComplete: boolean;
}
export type VerifierService = (input: VerifyInput) => Promise<Result<VerifyOutput, AgentError>>;

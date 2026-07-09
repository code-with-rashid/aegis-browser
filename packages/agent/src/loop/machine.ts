import type { Action, ExecutorContext, RunOutcome } from '@aegis/actions';
import type { CdpError, PerceptionPayload } from '@aegis/perception';
import { isErr, type Result } from '@aegis/shared';
import { assign, fromPromise, setup } from 'xstate';

import { buildConfirmationRequest, type ConfirmationRequest } from './confirmation';
import type { AgentError } from './errors';
import { summarizeRunOutcome, type RunSummary } from './run-summary';
import type {
  DecideInput,
  DecideOutput,
  LoopServices,
  PerceiveInput,
  PlanInput,
  PlanOutput,
  PolicyCheckInput,
  PolicyCheckOutput,
  VerifyInput,
  VerifyOutput,
} from './services';

function assertDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

/** Plain, JSON-serializable summary of a service failure — safe to persist. */
export interface LoopErrorSummary {
  readonly code: string;
  readonly message: string;
}

function toErrorSummary(error: AgentError): LoopErrorSummary {
  return { code: error.code, message: error.message };
}

/** Default guardrails (#19) — generous enough for real multi-step tasks, finite so the loop can never run forever. */
export const DEFAULT_MAX_STEPS = 40;
export const DEFAULT_MAX_REPLANS = 8;

export interface AgentLoopInput {
  readonly task: string;
  readonly tabId: number;
  /** Max action-execution cycles (`acting`) before the loop gives up. Default {@link DEFAULT_MAX_STEPS}. */
  readonly maxSteps?: number;
  /** Max times the loop may replan (stuck/rejected/stalled/failed-verification) before giving up. Default {@link DEFAULT_MAX_REPLANS}. */
  readonly maxReplans?: number;
}

export interface AgentLoopContext {
  readonly task: string;
  readonly tabId: number;
  readonly maxSteps: number;
  readonly maxReplans: number;
  readonly stepCount: number;
  readonly replanCount: number;
  readonly subGoal: string | undefined;
  readonly subGoalHistory: readonly string[];
  readonly perception: PerceptionPayload | undefined;
  readonly proposedActions: readonly Action[];
  readonly lastRunSummary: RunSummary | undefined;
  readonly lastError: LoopErrorSummary | undefined;
  readonly taskSummary: string | undefined;
  /** The actions currently awaiting human approval — set on entering `confirming`. */
  readonly pendingConfirmation: ConfirmationRequest | undefined;
}

export type AgentLoopEvent =
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'APPROVE' }
  | { type: 'REJECT' }
  | { type: 'EDIT'; actions: readonly Action[] };

/**
 * Builds the agent loop state machine (`docs/DESIGN.md` §5), closing over `services`
 * (planner/navigator/verifier/policy — injected so the machine stays pure and testable
 * with mocks) and `executorContext` (the live `CdpSession` + `TabManager` perception and
 * actions run against). Call once per task; `createActor` a new instance per run.
 *
 * Every invoked actor forwards its own `signal` (an `AbortSignal` XState ties to that
 * invocation's lifetime) into the corresponding service call, so a service that honors
 * it (e.g. the action runner, or any `generateStructured`-backed service) actually
 * cancels in-flight work the moment the state is exited — including on `STOP`, which is
 * handled as a normal event on every active state and so always takes effect immediately
 * regardless of what the current step is doing (`docs/adr/0008-loop-guardrails.md`).
 */
export function createAgentLoopMachine(services: LoopServices, executorContext: ExecutorContext) {
  return setup({
    types: {
      context: {} as AgentLoopContext,
      events: {} as AgentLoopEvent,
      input: {} as AgentLoopInput,
    },
    actors: {
      planActor: fromPromise<Result<PlanOutput, AgentError>, PlanInput>(({ input, signal }) =>
        services.plan(input, signal),
      ),
      perceiveActor: fromPromise<Result<PerceptionPayload, CdpError>, PerceiveInput>(
        ({ input, signal }) => services.perceive(input, signal),
      ),
      decideActor: fromPromise<Result<DecideOutput, AgentError>, DecideInput>(({ input, signal }) =>
        services.decide(input, signal),
      ),
      policyActor: fromPromise<Result<PolicyCheckOutput, AgentError>, PolicyCheckInput>(
        ({ input, signal }) => services.checkPolicy(input, signal),
      ),
      actActor: fromPromise<RunOutcome, { actions: readonly Action[] }>(({ input, signal }) =>
        services.act(input.actions, executorContext, signal),
      ),
      verifyActor: fromPromise<Result<VerifyOutput, AgentError>, VerifyInput>(({ input, signal }) =>
        services.verify(input, signal),
      ),
    },
  }).createMachine({
    id: 'agentLoop',
    context: ({ input }) => ({
      task: input.task,
      tabId: input.tabId,
      maxSteps: input.maxSteps ?? DEFAULT_MAX_STEPS,
      maxReplans: input.maxReplans ?? DEFAULT_MAX_REPLANS,
      stepCount: 0,
      replanCount: 0,
      subGoal: undefined,
      subGoalHistory: [],
      perception: undefined,
      proposedActions: [],
      lastRunSummary: undefined,
      lastError: undefined,
      taskSummary: undefined,
      pendingConfirmation: undefined,
    }),
    initial: 'planning',
    states: {
      planning: {
        invoke: {
          src: 'planActor',
          input: ({ context }) => ({
            task: context.task,
            perception: context.perception,
            subGoalHistory: context.subGoalHistory,
          }),
          onDone: [
            {
              guard: ({ event }) => isErr(event.output),
              target: 'failed',
              actions: assign({
                lastError: ({ event }) =>
                  isErr(event.output) ? toErrorSummary(event.output.error) : undefined,
              }),
            },
            {
              guard: ({ event }) => !isErr(event.output) && event.output.value.taskComplete,
              target: 'done',
              actions: assign({
                taskSummary: ({ event }) =>
                  !isErr(event.output) ? event.output.value.summary : undefined,
              }),
            },
            {
              target: 'perceiving',
              actions: assign({
                subGoal: ({ event }) =>
                  !isErr(event.output) ? event.output.value.subGoal : undefined,
                subGoalHistory: ({ context, event }) =>
                  !isErr(event.output)
                    ? [...context.subGoalHistory, event.output.value.subGoal]
                    : context.subGoalHistory,
              }),
            },
          ],
          onError: {
            target: 'failed',
            actions: assign({
              lastError: () => ({ code: 'PLANNER_FAILED', message: 'Planner threw unexpectedly' }),
            }),
          },
        },
        on: { STOP: 'stopped' },
      },

      perceiving: {
        invoke: {
          src: 'perceiveActor',
          input: ({ context }) => ({
            session: executorContext.session,
            goal: context.subGoal ?? context.task,
          }),
          onDone: [
            {
              guard: ({ event }) => isErr(event.output),
              target: 'failed',
              actions: assign({
                lastError: ({ event }) =>
                  isErr(event.output)
                    ? { code: event.output.error.code, message: event.output.error.message }
                    : undefined,
              }),
            },
            {
              target: 'deciding',
              actions: assign({
                perception: ({ event }) => (!isErr(event.output) ? event.output.value : undefined),
              }),
            },
          ],
          onError: {
            target: 'failed',
            actions: assign({
              lastError: () => ({
                code: 'CDP_SEND_FAILED',
                message: 'Perceive threw unexpectedly',
              }),
            }),
          },
        },
        on: { STOP: 'stopped', PAUSE: 'paused' },
      },

      deciding: {
        invoke: {
          src: 'decideActor',
          input: ({ context }) => ({
            subGoal: context.subGoal ?? context.task,
            perception: assertDefined(context.perception, 'deciding requires perception'),
          }),
          onDone: [
            {
              guard: ({ event }) => isErr(event.output),
              target: 'failed',
              actions: assign({
                lastError: ({ event }) =>
                  isErr(event.output) ? toErrorSummary(event.output.error) : undefined,
              }),
            },
            {
              guard: ({ event }) => !isErr(event.output) && event.output.value.stuck,
              target: 'replanning',
            },
            {
              target: 'policyCheck',
              actions: assign({
                proposedActions: ({ event }) =>
                  !isErr(event.output) ? event.output.value.actions : [],
              }),
            },
          ],
          onError: {
            target: 'failed',
            actions: assign({
              lastError: () => ({
                code: 'NAVIGATOR_FAILED',
                message: 'Navigator threw unexpectedly',
              }),
            }),
          },
        },
        on: { STOP: 'stopped' },
      },

      policyCheck: {
        invoke: {
          src: 'policyActor',
          input: ({ context }) => ({ actions: context.proposedActions }),
          onDone: [
            {
              guard: ({ event }) => isErr(event.output),
              target: 'failed',
              actions: assign({
                lastError: ({ event }) =>
                  isErr(event.output) ? toErrorSummary(event.output.error) : undefined,
              }),
            },
            {
              guard: ({ event }) => !isErr(event.output) && event.output.value.decision === 'deny',
              target: 'replanning',
              actions: assign({
                lastError: ({ event }) =>
                  !isErr(event.output)
                    ? {
                        code: 'POLICY_DENIED',
                        message: event.output.value.reason ?? 'Policy denied this action',
                      }
                    : undefined,
              }),
            },
            {
              guard: ({ event }) =>
                !isErr(event.output) && event.output.value.decision === 'confirm',
              target: 'confirming',
              actions: assign({
                pendingConfirmation: ({ context, event }) =>
                  !isErr(event.output)
                    ? buildConfirmationRequest(
                        context.proposedActions,
                        context.perception,
                        event.output.value.reason,
                      )
                    : undefined,
              }),
            },
            { target: 'actingGate' },
          ],
          onError: {
            target: 'failed',
            actions: assign({
              lastError: () => ({
                code: 'POLICY_CHECK_FAILED',
                message: 'Policy check threw unexpectedly',
              }),
            }),
          },
        },
        on: { STOP: 'stopped' },
      },

      confirming: {
        on: {
          APPROVE: {
            target: 'actingGate',
            actions: assign({ pendingConfirmation: () => undefined }),
          },
          REJECT: {
            target: 'replanning',
            actions: assign({ pendingConfirmation: () => undefined }),
          },
          EDIT: {
            target: 'confirming',
            actions: assign({
              proposedActions: ({ event }) => event.actions,
              pendingConfirmation: ({ context, event }) =>
                buildConfirmationRequest(
                  event.actions,
                  context.perception,
                  context.pendingConfirmation?.reason,
                ),
            }),
          },
          STOP: 'stopped',
        },
      },

      /** Enforces the step budget before every action-execution cycle (#19). */
      actingGate: {
        always: [
          {
            guard: ({ context }) => context.stepCount >= context.maxSteps,
            target: 'failed',
            actions: assign({
              lastError: ({ context }) => ({
                code: 'MAX_STEPS_EXCEEDED',
                message: `Reached the maximum of ${context.maxSteps} step(s) without completing the task`,
              }),
            }),
          },
          {
            target: 'acting',
            actions: assign({ stepCount: ({ context }) => context.stepCount + 1 }),
          },
        ],
      },

      acting: {
        invoke: {
          src: 'actActor',
          input: ({ context }) => ({ actions: context.proposedActions }),
          onDone: [
            {
              guard: ({ event }) => event.output.kind === 'completed',
              target: 'verifying',
              actions: assign({ lastRunSummary: ({ event }) => summarizeRunOutcome(event.output) }),
            },
            {
              guard: ({ event }) => event.output.kind === 'stalled',
              target: 'replanning',
              actions: assign({ lastRunSummary: ({ event }) => summarizeRunOutcome(event.output) }),
            },
            {
              guard: ({ event }) => event.output.kind === 'aborted',
              target: 'paused',
              actions: assign({ lastRunSummary: ({ event }) => summarizeRunOutcome(event.output) }),
            },
            {
              target: 'failed',
              actions: assign({
                lastRunSummary: ({ event }) => summarizeRunOutcome(event.output),
                lastError: ({ event }) => ({
                  code: 'ACTION_RUN_FAILED',
                  message:
                    event.output.kind === 'failed'
                      ? `Action "${event.output.failedAction.type}" failed after retries`
                      : 'Action run failed',
                }),
              }),
            },
          ],
          onError: {
            target: 'failed',
            actions: assign({
              lastError: () => ({
                code: 'ACTION_RUN_FAILED',
                message: 'Action runner threw unexpectedly',
              }),
            }),
          },
        },
        on: { STOP: 'stopped' },
      },

      verifying: {
        invoke: {
          src: 'verifyActor',
          input: ({ context }) => ({
            task: context.task,
            subGoal: context.subGoal ?? context.task,
            perception: assertDefined(context.perception, 'verifying requires perception'),
            runSummary: assertDefined(context.lastRunSummary, 'verifying requires a run summary'),
          }),
          onDone: [
            {
              guard: ({ event }) => isErr(event.output),
              target: 'failed',
              actions: assign({
                lastError: ({ event }) =>
                  isErr(event.output) ? toErrorSummary(event.output.error) : undefined,
              }),
            },
            {
              guard: ({ event }) =>
                !isErr(event.output) &&
                event.output.value.outcome === 'achieved' &&
                event.output.value.taskComplete,
              target: 'done',
            },
            {
              guard: ({ event }) =>
                !isErr(event.output) && event.output.value.outcome === 'achieved',
              target: 'planning',
            },
            {
              guard: ({ event }) => !isErr(event.output) && event.output.value.outcome === 'failed',
              target: 'replanning',
            },
            { target: 'perceiving' },
          ],
          onError: {
            target: 'failed',
            actions: assign({
              lastError: () => ({
                code: 'VERIFIER_FAILED',
                message: 'Verifier threw unexpectedly',
              }),
            }),
          },
        },
        on: { STOP: 'stopped' },
      },

      /** Enforces the replan budget before every replan (#19). */
      replanning: {
        always: [
          {
            guard: ({ context }) => context.replanCount >= context.maxReplans,
            target: 'failed',
            actions: assign({
              lastError: ({ context }) => ({
                code: 'MAX_REPLANS_EXCEEDED',
                message: `Reached the maximum of ${context.maxReplans} replan(s) without completing the task`,
              }),
            }),
          },
          {
            target: 'planning',
            actions: assign({ replanCount: ({ context }) => context.replanCount + 1 }),
          },
        ],
      },

      paused: {
        on: { RESUME: 'perceiving', STOP: 'stopped' },
      },

      done: { type: 'final' },
      failed: { type: 'final' },
      stopped: { type: 'final' },
    },
  });
}

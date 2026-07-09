import type { Action, ExecutorContext, RunOutcome } from '@aegis/actions';
import type { CdpError, PerceptionPayload } from '@aegis/perception';
import { isErr, type Result } from '@aegis/shared';
import { assign, fromPromise, setup } from 'xstate';

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

export interface AgentLoopInput {
  readonly task: string;
  readonly tabId: number;
}

export interface AgentLoopContext {
  readonly task: string;
  readonly tabId: number;
  readonly subGoal: string | undefined;
  readonly subGoalHistory: readonly string[];
  readonly perception: PerceptionPayload | undefined;
  readonly proposedActions: readonly Action[];
  readonly lastRunSummary: RunSummary | undefined;
  readonly lastError: LoopErrorSummary | undefined;
  readonly taskSummary: string | undefined;
}

export type AgentLoopEvent =
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'APPROVE' }
  | { type: 'REJECT' };

/**
 * Builds the agent loop state machine (`docs/DESIGN.md` §5), closing over `services`
 * (planner/navigator/verifier/policy — injected so the machine stays pure and testable
 * with mocks) and `executorContext` (the live `CdpSession` + `TabManager` perception and
 * actions run against). Call once per task; `createActor` a new instance per run.
 */
export function createAgentLoopMachine(services: LoopServices, executorContext: ExecutorContext) {
  return setup({
    types: {
      context: {} as AgentLoopContext,
      events: {} as AgentLoopEvent,
      input: {} as AgentLoopInput,
    },
    actors: {
      planActor: fromPromise<Result<PlanOutput, AgentError>, PlanInput>(({ input }) =>
        services.plan(input),
      ),
      perceiveActor: fromPromise<Result<PerceptionPayload, CdpError>, PerceiveInput>(({ input }) =>
        services.perceive(input),
      ),
      decideActor: fromPromise<Result<DecideOutput, AgentError>, DecideInput>(({ input }) =>
        services.decide(input),
      ),
      policyActor: fromPromise<Result<PolicyCheckOutput, AgentError>, PolicyCheckInput>(
        ({ input }) => services.checkPolicy(input),
      ),
      actActor: fromPromise<RunOutcome, { actions: readonly Action[] }>(({ input }) =>
        services.act(input.actions, executorContext),
      ),
      verifyActor: fromPromise<Result<VerifyOutput, AgentError>, VerifyInput>(({ input }) =>
        services.verify(input),
      ),
    },
  }).createMachine({
    id: 'agentLoop',
    context: ({ input }) => ({
      task: input.task,
      tabId: input.tabId,
      subGoal: undefined,
      subGoalHistory: [],
      perception: undefined,
      proposedActions: [],
      lastRunSummary: undefined,
      lastError: undefined,
      taskSummary: undefined,
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
              guard: ({ event }) => !isErr(event.output) && event.output.value.requiresConfirmation,
              target: 'confirming',
            },
            { target: 'acting' },
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
          APPROVE: 'acting',
          REJECT: 'replanning',
          STOP: 'stopped',
        },
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

      replanning: {
        always: 'planning',
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

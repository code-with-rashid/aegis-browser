import { targetRefOf, type Action, type ToolContext, type ToolRegistry } from '@aegis/actions';
import type { DecideInput, NavigatorService } from '@aegis/agent';
import { getPerceptionPayload, type CdpSession } from '@aegis/perception';
import { err, isErr, ok, type Result } from '@aegis/shared';

import { deriveSelector } from '../recorder/derive-selector';
import type { WorkflowStep, WorkflowTarget } from '../schema';
import { evaluatePostCondition } from '../executor/evaluate-post-condition';
import { WorkflowExecutionError } from '../executor/executor-error';
import type { NeedsHealingSignal, WorkflowStepResult } from '../executor/execute-workflow';

/** What `healStep` needs to know about the one step it's trying to recover. */
export interface HealStepInput {
  /** The workflow's own name — grounding for the Navigator, same role `DecideInput.task` plays in a live run. */
  readonly workflowName: string;
  readonly step: WorkflowStep;
  readonly needsHealing: NeedsHealingSignal;
}

/** Everything `healStep` needs to perceive the page, ask the Navigator for a fix, and try it. */
export interface HealStepDeps {
  readonly navigate: NavigatorService;
  readonly registry: ToolRegistry;
  readonly ctx: ToolContext;
  readonly session: CdpSession;
}

/** A step successfully recovered — its new definition, and the result of the tool call that proved the fix works. */
export interface HealedStep {
  readonly step: WorkflowStep;
  readonly result: WorkflowStepResult;
}

function healSubGoal(step: WorkflowStep, needsHealing: NeedsHealingSignal): string {
  const targetHint =
    step.target?.selector !== undefined
      ? ` (previously targeted selector "${step.target.selector}")`
      : '';
  return [
    `A previously recorded workflow step can no longer be replayed as recorded: it called`,
    ` tool "${step.toolId}"${targetHint}.`,
    ` It failed because: ${needsHealing.message}`,
    ` Find the current equivalent element or tool call that achieves the same effect on`,
    ` this page, and call it now.`,
  ].join('');
}

async function healedTarget(
  toolId: string,
  args: unknown,
  session: CdpSession,
): Promise<WorkflowTarget | undefined> {
  if (!toolId.startsWith('browser.')) {
    return undefined;
  }
  const ref = targetRefOf(args as Action);
  if (ref === undefined) {
    return undefined;
  }
  const selector = await deriveSelector(session, ref);
  return selector !== undefined ? { ref, selector } : { ref };
}

/**
 * Recovers exactly the one step named in `input.needsHealing` (#113) — "re-locate/re-plan
 * only that step", not the whole workflow. Asks `deps.navigate` (the same
 * `NavigatorService` the live agent loop uses, `@aegis/agent`) to propose a fix against a
 * fresh perception of the current page, framing the broken step as the sub-goal; only its
 * *first* proposed tool call is tried — healing repairs one broken step, it doesn't hand
 * the Navigator a fresh multi-step plan. If the step declared an `expect` post-condition
 * (#112), the fix must also satisfy it — a tool call that merely doesn't error isn't
 * enough evidence the step is actually fixed.
 *
 * Deliberately does not apply any risk/confirmation gate before executing the proposed
 * fix — that's #114's job ("Healing safety & review"), not this issue's; #113 only proves
 * the mechanical re-locate-and-retry loop works end to end.
 */
export async function healStep(
  input: HealStepInput,
  deps: HealStepDeps,
  signal?: AbortSignal,
): Promise<Result<HealedStep, WorkflowExecutionError>> {
  const subGoal = healSubGoal(input.step, input.needsHealing);

  const perception = await getPerceptionPayload(deps.session, { goal: subGoal });
  if (isErr(perception)) {
    return err(
      new WorkflowExecutionError('HEAL_FAILED', 'Could not perceive the page to heal this step', {
        cause: perception.error,
      }),
    );
  }

  const decideInput: DecideInput = {
    task: input.workflowName,
    subGoal,
    perception: perception.value,
  };
  const decision = await deps.navigate(decideInput, signal);
  if (isErr(decision)) {
    return err(
      new WorkflowExecutionError('HEAL_FAILED', 'The navigator failed to propose a fix', {
        cause: decision.error,
      }),
    );
  }

  const toolCall = decision.value.toolCalls?.[0];
  if (decision.value.stuck || toolCall === undefined) {
    return err(
      new WorkflowExecutionError(
        'HEAL_FAILED',
        `The navigator could not find a way to recover step "${input.step.stepId}"`,
      ),
    );
  }

  const callResult = await deps.registry.call(toolCall.toolId, toolCall.args, deps.ctx);
  if (isErr(callResult)) {
    return err(
      new WorkflowExecutionError(
        'HEAL_FAILED',
        `The proposed fix failed: ${callResult.error.message}`,
        { cause: callResult.error },
      ),
    );
  }

  if (input.step.expect !== undefined) {
    const checked = await evaluatePostCondition(input.step.expect, deps.session);
    if (!checked.ok || !checked.value) {
      return err(
        new WorkflowExecutionError(
          'HEAL_FAILED',
          `Step "${input.step.stepId}" still fails its post-condition after the proposed fix`,
        ),
      );
    }
  }

  const target = await healedTarget(toolCall.toolId, toolCall.args, deps.session);
  const healedStep: WorkflowStep = {
    stepId: input.step.stepId,
    toolId: toolCall.toolId,
    args: toolCall.args,
    ...(target !== undefined ? { target } : {}),
    ...(input.step.expect !== undefined ? { expect: input.step.expect } : {}),
  };

  return ok({
    step: healedStep,
    result: {
      stepId: input.step.stepId,
      toolId: toolCall.toolId,
      succeeded: true,
      output: callResult.value,
    },
  });
}

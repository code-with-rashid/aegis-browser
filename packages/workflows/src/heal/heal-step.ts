import { targetRefOf, type Action, type ToolContext, type ToolRegistry } from '@aegis/actions';
import type { DecideInput, NavigatorService, ToolCall } from '@aegis/agent';
import { getPerceptionPayload, type CdpSession, type PerceptionPayload } from '@aegis/perception';
import { err, isErr, ok, type Result } from '@aegis/shared';

import { evaluatePostCondition } from '../executor/evaluate-post-condition';
import { WorkflowExecutionError } from '../executor/executor-error';
import type { NeedsHealingSignal, WorkflowStepResult } from '../executor/execute-workflow';
import { deriveSelector } from '../recorder/derive-selector';
import type { RunPolicy, WorkflowStep, WorkflowTarget } from '../schema';
import { buildHealDiff, type HealDiff } from './heal-diff';
import { gateHeal, type RunMode } from './heal-gate';

/** What `healStep` needs to know about the one step it's trying to recover. */
export interface HealStepInput {
  /** The workflow's own name — grounding for the Navigator, same role `DecideInput.task` plays in a live run. */
  readonly workflowName: string;
  readonly step: WorkflowStep;
  readonly needsHealing: NeedsHealingSignal;
}

/** Everything `healStep` needs to perceive the page, ask the Navigator for a fix, gate it, and try it. */
export interface HealStepDeps {
  readonly navigate: NavigatorService;
  readonly registry: ToolRegistry;
  readonly ctx: ToolContext;
  readonly session: CdpSession;
  /** The workflow's own pre-authorization boundary — a heal may never exceed it (#114). */
  readonly runPolicy: RunPolicy;
  readonly mode: RunMode;
}

/** A step successfully recovered — its new definition, and the result of the tool call that proved the fix works. */
export interface HealedStep {
  readonly step: WorkflowStep;
  readonly result: WorkflowStepResult;
}

/** A gated heal that hasn't executed yet — everything `applyConfirmedHeal` needs once a human confirms it. */
export interface PendingHeal {
  readonly step: WorkflowStep;
  readonly toolCall: ToolCall;
}

/**
 * How a heal attempt ended. `applied`: the fix ran and (if the run is unattended, or the
 * fix isn't state-changing) needed no one's sign-off. `needs_confirmation`: the fix is a
 * state-changing action proposed by the Navigator, not the original recording — it must
 * not run until a human reviews `diff` and calls `applyConfirmedHeal` (#114).
 * `hard_stopped`: the fix would exceed the workflow's `RunPolicy`, or is state-changing
 * with no one to ask (unattended) — it never ran at all.
 */
export type HealOutcome =
  | { readonly kind: 'applied'; readonly step: WorkflowStep; readonly result: WorkflowStepResult }
  | { readonly kind: 'needs_confirmation'; readonly diff: HealDiff; readonly pending: PendingHeal }
  | { readonly kind: 'hard_stopped'; readonly reason: string; readonly diff: HealDiff };

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

/** The accessible name of a proposed browser tool call's target element, if it has one and `perception` still lists it — the same `ActionRiskContext.elementName` signal the live agent loop's policy service feeds `classify`. */
function elementNameFor(toolCall: ToolCall, perception: PerceptionPayload): string | undefined {
  if (!toolCall.toolId.startsWith('browser.')) {
    return undefined;
  }
  const ref = targetRefOf(toolCall.args as Action);
  if (ref === undefined) {
    return undefined;
  }
  return perception.elements.find((element) => element.ref === ref)?.name;
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
 * Executes an already-gated fix and finalizes it into a healed step — the part
 * `healStep` skips over for a fix that needs confirmation first, and the part
 * `applyConfirmedHeal` runs once a human has actually confirmed one.
 */
async function executeHealedFix(
  pending: PendingHeal,
  deps: Pick<HealStepDeps, 'registry' | 'ctx' | 'session'>,
): Promise<Result<HealedStep, WorkflowExecutionError>> {
  const { step: originalStep, toolCall } = pending;

  const callResult = await deps.registry.call(toolCall.toolId, toolCall.args, deps.ctx);
  if (isErr(callResult)) {
    return err(
      new WorkflowExecutionError(
        'HEAL_FAILED',
        `The proposed fix failed: ${callResult.error.message}`,
        {
          cause: callResult.error,
        },
      ),
    );
  }

  if (originalStep.expect !== undefined) {
    const checked = await evaluatePostCondition(originalStep.expect, deps.session);
    if (!checked.ok || !checked.value) {
      return err(
        new WorkflowExecutionError(
          'HEAL_FAILED',
          `Step "${originalStep.stepId}" still fails its post-condition after the proposed fix`,
        ),
      );
    }
  }

  const target = await healedTarget(toolCall.toolId, toolCall.args, deps.session);
  const healedStep: WorkflowStep = {
    stepId: originalStep.stepId,
    toolId: toolCall.toolId,
    args: toolCall.args,
    ...(target !== undefined ? { target } : {}),
    ...(originalStep.expect !== undefined ? { expect: originalStep.expect } : {}),
  };

  return ok({
    step: healedStep,
    result: {
      stepId: originalStep.stepId,
      toolId: toolCall.toolId,
      succeeded: true,
      output: callResult.value,
    },
  });
}

/** Runs a fix a human has already confirmed via a `needs_confirmation` `HealOutcome`'s `pending`. */
export async function applyConfirmedHeal(
  pending: PendingHeal,
  deps: Pick<HealStepDeps, 'registry' | 'ctx' | 'session'>,
): Promise<Result<HealedStep, WorkflowExecutionError>> {
  return executeHealedFix(pending, deps);
}

/**
 * Recovers exactly the one step named in `input.needsHealing` (#113) — "re-locate/re-plan
 * only that step", not the whole workflow. Asks `deps.navigate` (the same
 * `NavigatorService` the live agent loop uses, `@aegis/agent`) to propose a fix against a
 * fresh perception of the current page, framing the broken step as the sub-goal; only its
 * *first* proposed tool call is tried — healing repairs one broken step, it doesn't hand
 * the Navigator a fresh multi-step plan.
 *
 * Before ever executing the proposed fix, `gateHeal` (#114) classifies its risk and checks
 * it against `deps.runPolicy` and `deps.mode` — a state-changing fix (LLM-proposed, never
 * reviewed) must not run until a human confirms it, and never runs at all unattended or
 * outside the workflow's own `RunPolicy`. Only once gating clears does the fix actually
 * execute, after which — if the step declared an `expect` post-condition (#112) — the fix
 * must also satisfy it.
 */
export async function healStep(
  input: HealStepInput,
  deps: HealStepDeps,
  signal?: AbortSignal,
): Promise<Result<HealOutcome, WorkflowExecutionError>> {
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

  const elementName = elementNameFor(toolCall, perception.value);
  const risk = deps.registry.classify(
    toolCall.toolId,
    elementName !== undefined ? { elementName } : undefined,
  );

  const proposedStep: WorkflowStep = {
    stepId: input.step.stepId,
    toolId: toolCall.toolId,
    args: toolCall.args,
    ...(input.step.expect !== undefined ? { expect: input.step.expect } : {}),
  };
  const diff = buildHealDiff(input.step, proposedStep, risk);

  const gate = gateHeal({
    toolId: toolCall.toolId,
    risk,
    runPolicy: deps.runPolicy,
    mode: deps.mode,
  });

  switch (gate.kind) {
    case 'hard_stop':
      return ok({ kind: 'hard_stopped', reason: gate.reason, diff });
    case 'needs_confirmation':
      return ok({ kind: 'needs_confirmation', diff, pending: { step: input.step, toolCall } });
    case 'auto_apply': {
      const applied = await executeHealedFix({ step: input.step, toolCall }, deps);
      if (!applied.ok) {
        return applied;
      }
      return ok({ kind: 'applied', step: applied.value.step, result: applied.value.result });
    }
  }
}

import { resolveRef, withTargetRef, type Action } from '@aegis/actions';
import type { CdpSession } from '@aegis/perception';
import { err, isErr, ok, toElementRef, type ElementRef, type Result } from '@aegis/shared';

import type { WorkflowStep } from '../schema';
import { WorkflowExecutionError } from './executor-error';

async function resolveSelectorToRef(
  session: CdpSession,
  selector: string,
): Promise<Result<ElementRef, WorkflowExecutionError>> {
  const document = await session.send('DOM.getDocument', {});
  if (isErr(document)) {
    return err(
      new WorkflowExecutionError('TARGET_NOT_FOUND', 'Could not read the page document', {
        cause: document.error,
      }),
    );
  }

  const found = await session.send('DOM.querySelector', {
    nodeId: document.value.root.nodeId,
    selector,
  });
  if (isErr(found) || found.value.nodeId === 0) {
    return err(
      new WorkflowExecutionError(
        'TARGET_NOT_FOUND',
        `Selector "${selector}" matched no element on the current page`,
      ),
    );
  }

  const described = await session.send('DOM.describeNode', { nodeId: found.value.nodeId });
  if (isErr(described)) {
    return err(
      new WorkflowExecutionError(
        'TARGET_NOT_FOUND',
        `Could not describe the element matched by selector "${selector}"`,
        { cause: described.error },
      ),
    );
  }

  return ok(toElementRef(`dom:${described.value.node.backendNodeId}`));
}

/**
 * Re-targets a recorded step for the current page. Tries the recorded `ref` first — it
 * resolves when replaying within the same page load the step was recorded against — then
 * falls back to the resilient `selector` (#109), the mechanism that actually matters for
 * a genuine "record once, replay later" workflow, since a fresh page load assigns new
 * backend node ids. A step with no `target` at all (a ref-less browser action, or a
 * non-browser tool call) is returned unchanged — there's nothing to re-target.
 * `TARGET_NOT_FOUND` when neither resolves; self-healing that failure is #113's job, not
 * this deterministic executor's.
 */
export async function resolveStepTarget(
  step: WorkflowStep,
  session: CdpSession,
): Promise<Result<WorkflowStep, WorkflowExecutionError>> {
  const target = step.target;
  if (target === undefined) {
    return ok(step);
  }

  if (target.ref !== undefined) {
    const resolved = await resolveRef(session, toElementRef(target.ref));
    if (!isErr(resolved)) {
      return ok(step);
    }
  }

  if (target.selector === undefined) {
    return err(
      new WorkflowExecutionError(
        'TARGET_NOT_FOUND',
        `Step "${step.stepId}" has no selector to fall back on, and its recorded ref no longer resolves`,
      ),
    );
  }

  const refResult = await resolveSelectorToRef(session, target.selector);
  if (!refResult.ok) {
    return refResult;
  }

  return ok({ ...step, args: withTargetRef(step.args as Action, refResult.value) });
}

import type { ToolContext, ToolRegistry } from '@aegis/actions';
import type { CdpSession } from '@aegis/perception';
import { err, ok, type Result } from '@aegis/shared';

import type { WorkflowError } from '../errors';
import { resolveWorkflowParams } from '../params/resolve-params';
import type { Workflow } from '../schema';
import { executeWorkflow, type WorkflowRunOutcome } from './execute-workflow';

/**
 * Binds `values` into `workflow.steps` (#110) and replays the result deterministically
 * (#111) — the one entry point a caller (a future "run this workflow" UI action or
 * scheduler, #115/#116) needs, so it never has to remember to resolve params before
 * executing. Fails with a `WorkflowError` (`PARAM_VALUE_MISSING`, etc.) before ever
 * calling a tool if binding fails — a missing required param is a configuration mistake
 * the run should never attempt partway through.
 */
export async function runWorkflow(
  workflow: Pick<Workflow, 'steps' | 'params'>,
  values: Readonly<Record<string, string>>,
  registry: ToolRegistry,
  ctx: ToolContext,
  session: CdpSession,
  signal?: AbortSignal,
): Promise<Result<WorkflowRunOutcome, WorkflowError>> {
  const resolved = resolveWorkflowParams(workflow.steps, workflow.params, values);
  if (!resolved.ok) {
    return err(resolved.error);
  }

  const outcome = await executeWorkflow(resolved.value, registry, ctx, session, signal);
  return ok(outcome);
}

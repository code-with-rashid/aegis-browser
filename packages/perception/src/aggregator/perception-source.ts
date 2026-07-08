import { isErr, ok, type Result } from '@aegis/shared';

import { getPerceivedAxTree } from '../ax/ax-tree-source';
import type { CdpError, CdpSession } from '../cdp/cdp-session';
import { getDomPerception } from '../dom/dom-source';
import { aggregatePerception } from './perception-payload';
import type { PerceptionPayload } from './perception-payload';

export interface GetPerceptionPayloadOptions {
  /** The agent's current sub-goal, used to rank elements by relevance. */
  readonly goal: string;
  readonly maxTokens?: number;
  readonly maxContentLength?: number;
}

/**
 * The perception pipeline's single entry point: pulls the AX tree (#8) and the DOM pass
 * (#9) over one `CdpSession`, then merges/ranks/budgets them into one
 * {@link PerceptionPayload} (#10) — what the agent loop calls on every perceive step.
 */
export async function getPerceptionPayload(
  session: CdpSession,
  options: GetPerceptionPayloadOptions,
): Promise<Result<PerceptionPayload, CdpError>> {
  const axResult = await getPerceivedAxTree(session);
  if (isErr(axResult)) {
    return axResult;
  }

  const domOptions =
    options.maxContentLength !== undefined ? { maxContentLength: options.maxContentLength } : {};
  const domResult = await getDomPerception(session, domOptions);
  if (isErr(domResult)) {
    return domResult;
  }

  const aggregateOptions = options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {};
  return ok(
    aggregatePerception({
      axElements: axResult.value.elements,
      domElements: domResult.value.elements,
      content: domResult.value.content,
      goal: options.goal,
      ...aggregateOptions,
    }),
  );
}

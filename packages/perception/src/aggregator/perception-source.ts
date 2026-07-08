import { isErr, ok, type Result } from '@aegis/shared';

import { getPerceivedAxTree } from '../ax/ax-tree-source';
import type { CdpError, CdpSession } from '../cdp/cdp-session';
import { getDomPerception } from '../dom/dom-source';
import { getVisionPerception } from '../vision/vision-perception';
import { aggregatePerception } from './perception-payload';
import type { PerceptionPayload } from './perception-payload';

export interface GetPerceptionPayloadOptions {
  /** The agent's current sub-goal, used to rank elements by relevance. */
  readonly goal: string;
  readonly maxTokens?: number;
  readonly maxContentLength?: number;
  /**
   * Off by default. Vision is a fallback for canvas/icon-only UIs where AX/DOM structure
   * is missing or unhelpful — it is never captured unless the caller opts in.
   */
  readonly useVision?: boolean;
}

/**
 * The perception pipeline's single entry point: pulls the AX tree (#8) and the DOM pass
 * (#9) over one `CdpSession`, then merges/ranks/budgets them into one
 * {@link PerceptionPayload} (#10) — what the agent loop calls on every perceive step.
 * Also captures the on-demand vision fallback (#11) when `useVision` is set.
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
  const payload = aggregatePerception({
    axElements: axResult.value.elements,
    domElements: domResult.value.elements,
    content: domResult.value.content,
    goal: options.goal,
    ...aggregateOptions,
  });

  if (!options.useVision) {
    return ok(payload);
  }

  const visionResult = await getVisionPerception(session, payload.elements);
  if (isErr(visionResult)) {
    return visionResult;
  }

  return ok({ ...payload, vision: visionResult.value });
}

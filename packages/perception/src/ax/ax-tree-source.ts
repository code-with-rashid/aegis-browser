import { isErr, ok, type Result } from '@aegis/shared';

import type { CdpError, CdpSession } from '../cdp/cdp-session';
import { normalizeAxTree, type NormalizedAxTree } from './ax-tree-normalizer';

/**
 * Pulls the full accessibility tree for the tab `session` is attached to and normalizes
 * it into {@link NormalizedAxTree}. Enables the `Accessibility` domain first (a no-op if
 * already enabled).
 */
export async function getPerceivedAxTree(
  session: CdpSession,
): Promise<Result<NormalizedAxTree, CdpError>> {
  const enableResult = await session.send('Accessibility.enable');
  if (isErr(enableResult)) {
    return enableResult;
  }

  const treeResult = await session.send('Accessibility.getFullAXTree');
  if (isErr(treeResult)) {
    return treeResult;
  }

  return ok(normalizeAxTree(treeResult.value.nodes));
}

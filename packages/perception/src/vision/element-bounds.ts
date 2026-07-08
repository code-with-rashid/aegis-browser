import { isErr, ok, type Result } from '@aegis/shared';

import type { ElementBounds } from '../ax/perceived-element';
import type { CdpError, CdpSession } from '../cdp/cdp-session';

/** Converts a CDP `Quad` (4 corner points, 8 numbers) into an axis-aligned bounding box. */
export function quadToBounds(quad: readonly number[]): ElementBounds | undefined {
  const xs = [quad[0], quad[2], quad[4], quad[6]].filter(
    (value): value is number => value !== undefined,
  );
  const ys = [quad[1], quad[3], quad[5], quad[7]].filter(
    (value): value is number => value !== undefined,
  );
  if (xs.length !== 4 || ys.length !== 4) {
    return undefined;
  }

  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Fetches one element's bounding box (its border quad) via `DOM.getBoxModel`. */
export async function getElementBounds(
  session: CdpSession,
  backendNodeId: number,
): Promise<Result<ElementBounds | undefined, CdpError>> {
  const result = await session.send('DOM.getBoxModel', { backendNodeId });
  if (isErr(result)) {
    return result;
  }
  return ok(quadToBounds(result.value.model.border));
}

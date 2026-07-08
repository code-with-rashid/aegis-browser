import { err, isErr, ok, type ElementRef, type Result } from '@aegis/shared';
import type { CdpError, CdpSession } from '@aegis/perception';

import { ActionExecutionError } from './types';

const REF_PATTERN = /^(?:ax|dom|el):(\d+)$/;

/** Extracts the backend node id a perception ref was minted from, if it encodes one. */
export function backendNodeIdOfRef(ref: ElementRef): number | undefined {
  const match = REF_PATTERN.exec(ref);
  if (!match) {
    return undefined;
  }
  const [, id] = match;
  return id !== undefined ? Number(id) : undefined;
}

export interface ResolvedElement {
  readonly backendNodeId: number;
  readonly objectId: string;
}

/**
 * Resolves a ref to a live `Runtime.RemoteObjectId` via `DOM.resolveNode`. Fails with
 * `REF_NOT_FOUND` when the ref doesn't encode a backend node id, or `ELEMENT_DETACHED`
 * when CDP can no longer find that node — the element was removed/replaced on the page
 * since it was perceived, which is expected on a dynamic page and must be handled
 * gracefully rather than crash the action runner.
 */
export async function resolveRef(
  session: CdpSession,
  ref: ElementRef,
): Promise<Result<ResolvedElement, ActionExecutionError>> {
  const backendNodeId = backendNodeIdOfRef(ref);
  if (backendNodeId === undefined) {
    return err(
      new ActionExecutionError('REF_NOT_FOUND', `Ref "${ref}" does not encode a backend node id`),
    );
  }

  const resolved = await session.send('DOM.resolveNode', { backendNodeId });
  if (isErr(resolved)) {
    return err(
      new ActionExecutionError(
        'ELEMENT_DETACHED',
        `Element for ref "${ref}" is no longer attached`,
        {
          cause: resolved.error,
        },
      ),
    );
  }

  const { objectId } = resolved.value.object;
  if (objectId === undefined) {
    return err(
      new ActionExecutionError(
        'ELEMENT_DETACHED',
        `Element for ref "${ref}" has no live object id`,
      ),
    );
  }

  return ok({ backendNodeId, objectId });
}

/** Calls `.focus()` on a resolved element via `Runtime.callFunctionOn`. */
export async function focusElement(
  session: CdpSession,
  objectId: string,
): Promise<Result<void, CdpError>> {
  const result = await session.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.focus(); }',
    returnByValue: true,
  });
  if (isErr(result)) {
    return result;
  }
  return ok(undefined);
}

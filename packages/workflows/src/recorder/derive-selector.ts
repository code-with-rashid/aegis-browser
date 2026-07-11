import { backendNodeIdOfRef } from '@aegis/actions';
import type { CdpSession } from '@aegis/perception';
import type { ElementRef } from '@aegis/shared';
import { isErr } from '@aegis/shared';

function attributeValue(flatAttributes: readonly string[], name: string): string | undefined {
  const index = flatAttributes.indexOf(name);
  if (index === -1 || index % 2 !== 0) {
    return undefined;
  }
  return flatAttributes[index + 1];
}

/**
 * Derives a best-effort, replayable CSS-ish selector for `ref` via `DOM.describeNode` —
 * `id` first (most stable), then `tag.class1.class2`, falling back to the bare tag name.
 * Returns `undefined` rather than throwing when the element can't be described (already
 * detached, or `ref` doesn't encode a backend node id) — a missing selector just means a
 * recorded step's `target` falls back to `ref`/`role`/`name` for a later self-heal pass to
 * work with (`docs/adr/0043-run-recorder.md`); it never blocks recording the rest of a run.
 */
export async function deriveSelector(
  session: CdpSession,
  ref: ElementRef,
): Promise<string | undefined> {
  const backendNodeId = backendNodeIdOfRef(ref);
  if (backendNodeId === undefined) {
    return undefined;
  }

  const result = await session.send('DOM.describeNode', { backendNodeId, depth: 0 });
  if (isErr(result)) {
    return undefined;
  }

  const { node } = result.value;
  const flatAttributes = node.attributes ?? [];
  const tag = node.nodeName.toLowerCase();

  const id = attributeValue(flatAttributes, 'id');
  if (id !== undefined && id.length > 0) {
    return `#${id}`;
  }

  const className = attributeValue(flatAttributes, 'class');
  const classes =
    className
      ?.trim()
      .split(/\s+/u)
      .filter((entry) => entry.length > 0) ?? [];
  if (classes.length > 0) {
    return `${tag}.${classes.join('.')}`;
  }

  return tag;
}

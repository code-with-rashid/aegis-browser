import { createFakeCdp, type FakeCdp } from '@aegis/perception';
import { ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { deriveSelector } from './derive-selector';

async function attachedFakeCdp(
  onSend: (method: string, params: unknown) => unknown,
): Promise<FakeCdp> {
  const cdp = createFakeCdp(1, {
    onSend: (method, params) => ok(onSend(method, params)),
  });
  await cdp.attach();
  return cdp;
}

describe('deriveSelector', () => {
  it('returns undefined when the ref does not encode a backend node id', async () => {
    const cdp = await attachedFakeCdp(() => {
      throw new Error('should never call CDP for an unresolvable ref');
    });
    const selector = await deriveSelector(cdp, toElementRef('not-a-ref'));
    expect(selector).toBeUndefined();
  });

  it('returns undefined when DOM.describeNode fails (element detached)', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => ({ ok: false, error: new Error('gone') }) as never,
    });
    await cdp.attach();
    const selector = await deriveSelector(cdp, toElementRef('ax:1'));
    expect(selector).toBeUndefined();
  });

  it('prefers an #id selector when the node has an id attribute', async () => {
    const cdp = await attachedFakeCdp(() => ({
      node: { nodeName: 'BUTTON', attributes: ['id', 'submit-button', 'class', 'btn primary'] },
    }));
    const selector = await deriveSelector(cdp, toElementRef('ax:1'));
    expect(selector).toBe('#submit-button');
  });

  it('falls back to tag.class1.class2 when there is no id', async () => {
    const cdp = await attachedFakeCdp(() => ({
      node: { nodeName: 'BUTTON', attributes: ['class', 'btn primary'] },
    }));
    const selector = await deriveSelector(cdp, toElementRef('ax:1'));
    expect(selector).toBe('button.btn.primary');
  });

  it('falls back to the bare lowercased tag name when there is no id or class', async () => {
    const cdp = await attachedFakeCdp(() => ({
      node: { nodeName: 'DIV', attributes: [] },
    }));
    const selector = await deriveSelector(cdp, toElementRef('ax:1'));
    expect(selector).toBe('div');
  });

  it('falls back to the tag name when attributes are entirely absent', async () => {
    const cdp = await attachedFakeCdp(() => ({
      node: { nodeName: 'SPAN' },
    }));
    const selector = await deriveSelector(cdp, toElementRef('ax:1'));
    expect(selector).toBe('span');
  });
});

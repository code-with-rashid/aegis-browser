import { err, isErr, isOk, ok } from '@aegis/shared';
import type Protocol from 'devtools-protocol/types/protocol';
import { describe, expect, it } from 'vitest';

import { CdpError } from '../cdp/cdp-session';
import { createFakeCdp } from '../cdp/fake-cdp';
import { getPerceivedAxTree } from './ax-tree-source';

function axValue(value: unknown): Protocol.Accessibility.AXValue {
  return { type: 'string', value };
}

describe('getPerceivedAxTree', () => {
  it('enables the Accessibility domain, pulls the tree, and normalizes it', async () => {
    const calls: string[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        calls.push(method);
        if (method === 'Accessibility.getFullAXTree') {
          const nodes: Protocol.Accessibility.AXNode[] = [
            {
              nodeId: '1',
              ignored: false,
              role: axValue('button'),
              name: axValue('Go'),
              backendDOMNodeId: 42,
            },
          ];
          return ok({ nodes });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await getPerceivedAxTree(cdp);

    expect(calls).toEqual(['Accessibility.enable', 'Accessibility.getFullAXTree']);
    expect(isOk(result) && result.value.elements).toHaveLength(1);
    expect(isOk(result) && result.value.elements[0]?.name).toBe('Go');
  });

  it('propagates a failure from enabling the domain without calling getFullAXTree', async () => {
    const calls: string[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        calls.push(method);
        return err(new CdpError('CDP_SEND_FAILED', 'boom'));
      },
    });
    await cdp.attach();

    const result = await getPerceivedAxTree(cdp);

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
    expect(calls).toEqual(['Accessibility.enable']);
  });

  it('propagates a failure from getFullAXTree', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          return err(new CdpError('CDP_SEND_FAILED', 'tree fetch failed'));
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await getPerceivedAxTree(cdp);

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });
});

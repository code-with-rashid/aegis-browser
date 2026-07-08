import { CdpError, createFakeCdp } from '@aegis/perception';
import { err, isErr, isOk, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { executeDone, executeExtract, executeWait } from './meta-executors';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Minimal fixture `DOM.Node` tree — just enough for `extractReadableContent` to find text. */
function articleWithText(paragraph: string) {
  return {
    nodeId: 1,
    backendNodeId: 1,
    nodeType: ELEMENT_NODE,
    nodeName: 'ARTICLE',
    localName: 'article',
    nodeValue: '',
    children: [
      {
        nodeId: 2,
        backendNodeId: 2,
        nodeType: ELEMENT_NODE,
        nodeName: 'P',
        localName: 'p',
        nodeValue: '',
        children: [
          {
            nodeId: 3,
            backendNodeId: 3,
            nodeType: TEXT_NODE,
            nodeName: '#text',
            localName: '',
            nodeValue: paragraph,
          },
        ],
      },
    ],
  };
}

describe('executeWait', () => {
  it('resolves after the given number of milliseconds', async () => {
    const start = performance.now();
    const result = await executeWait({ type: 'wait', ms: 10 });
    const elapsed = performance.now() - start;

    expect(isOk(result) && result.value).toEqual({ kind: 'wait' });
    expect(elapsed).toBeGreaterThanOrEqual(9);
  });
});

describe('executeExtract', () => {
  it('returns the page’s extracted readable content', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'DOM.getDocument') {
          const root = articleWithText(
            'Some readable content long enough to pass the size floor for tests.',
          );
          return ok({ root });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeExtract(cdp, {
      type: 'extract',
      instructions: 'get the article text',
    });

    expect(isOk(result) && result.value.text).toContain('Some readable content');
  });

  it('propagates a CDP failure', async () => {
    const cdp = createFakeCdp(1, { onSend: () => err(new CdpError('CDP_SEND_FAILED', 'boom')) });
    await cdp.attach();

    const result = await executeExtract(cdp, {
      type: 'extract',
      instructions: 'get the article text',
    });

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });
});

describe('executeDone', () => {
  it('echoes back success and summary', () => {
    const result = executeDone({ type: 'done', success: true, summary: 'Task complete' });

    expect(isOk(result) && result.value).toEqual({
      kind: 'done',
      success: true,
      summary: 'Task complete',
    });
  });
});

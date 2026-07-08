import { CdpError, createFakeCdp } from '@aegis/perception';
import { err, isErr, isOk, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { executeGoBack, executeNavigate } from './navigation-executors';

describe('executeNavigate', () => {
  it('navigates to the given url', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        expect(method).toBe('Page.navigate');
        expect(params).toEqual({ url: 'https://example.com' });
        return ok({ frameId: 'frame-1' });
      },
    });
    await cdp.attach();

    const result = await executeNavigate(cdp, { type: 'navigate', url: 'https://example.com' });

    expect(isOk(result) && result.value).toEqual({ kind: 'navigate', url: 'https://example.com' });
  });

  it('fails when Page.navigate reports an errorText', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () => ok({ frameId: 'frame-1', errorText: 'net::ERR_NAME_NOT_RESOLVED' }),
    });
    await cdp.attach();

    const result = await executeNavigate(cdp, { type: 'navigate', url: 'https://bad.example' });

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });

  it('propagates a CDP send failure', async () => {
    const cdp = createFakeCdp(1, { onSend: () => err(new CdpError('CDP_SEND_FAILED', 'boom')) });
    await cdp.attach();

    const result = await executeNavigate(cdp, { type: 'navigate', url: 'https://example.com' });

    expect(isErr(result)).toBe(true);
  });
});

describe('executeGoBack', () => {
  it('navigates to the previous history entry', async () => {
    const calls: unknown[] = [];
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        calls.push([method, params]);
        if (method === 'Page.getNavigationHistory') {
          return ok({
            currentIndex: 1,
            entries: [
              {
                id: 10,
                url: 'https://a.example',
                userTypedURL: '',
                title: '',
                transitionType: 'typed',
              },
              {
                id: 11,
                url: 'https://b.example',
                userTypedURL: '',
                title: '',
                transitionType: 'link',
              },
            ],
          });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();

    const result = await executeGoBack(cdp);

    expect(isOk(result) && result.value).toEqual({ kind: 'go_back' });
    expect(calls).toContainEqual(['Page.navigateToHistoryEntry', { entryId: 10 }]);
  });

  it('fails when there is no previous history entry', async () => {
    const cdp = createFakeCdp(1, {
      onSend: () =>
        ok({
          currentIndex: 0,
          entries: [
            {
              id: 10,
              url: 'https://a.example',
              userTypedURL: '',
              title: '',
              transitionType: 'typed',
            },
          ],
        }),
    });
    await cdp.attach();

    const result = await executeGoBack(cdp);

    expect(isErr(result) && result.error.code).toBe('CDP_SEND_FAILED');
  });

  it('propagates a navigation-history read failure', async () => {
    const cdp = createFakeCdp(1, { onSend: () => err(new CdpError('CDP_SEND_FAILED', 'boom')) });
    await cdp.attach();

    const result = await executeGoBack(cdp);

    expect(isErr(result)).toBe(true);
  });
});

import { err, isErr, isOk, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { resolveAuthHeaders, type SecretResolver } from './resolve-headers';

function resolverFor(secrets: Record<string, string>): SecretResolver {
  return (name) => {
    const value = secrets[name];
    return Promise.resolve(
      value !== undefined ? ok(value) : err({ message: `No secret named "${name}"` }),
    );
  };
}

describe('resolveAuthHeaders', () => {
  it('resolves an empty list to an empty header map', async () => {
    const result = await resolveAuthHeaders([], resolverFor({}));

    expect(isOk(result) && result.value).toEqual({});
  });

  it('resolves each configured header to its secret value', async () => {
    const result = await resolveAuthHeaders(
      [{ name: 'Authorization', secretName: 'my-token' }],
      resolverFor({ 'my-token': 'Bearer abc123' }),
    );

    expect(isOk(result) && result.value).toEqual({ Authorization: 'Bearer abc123' });
  });

  it('resolves multiple headers from distinct secrets', async () => {
    const result = await resolveAuthHeaders(
      [
        { name: 'Authorization', secretName: 'token' },
        { name: 'X-Api-Key', secretName: 'api-key' },
      ],
      resolverFor({ token: 'Bearer abc', 'api-key': 'xyz' }),
    );

    expect(isOk(result) && result.value).toEqual({
      Authorization: 'Bearer abc',
      'X-Api-Key': 'xyz',
    });
  });

  it('fails when a referenced secret does not exist', async () => {
    const result = await resolveAuthHeaders(
      [{ name: 'Authorization', secretName: 'missing' }],
      resolverFor({}),
    );

    expect(isErr(result) && result.error.message).toContain('missing');
  });

  it('never resolves a value the caller did not explicitly provide via the resolver', async () => {
    let calledWith: string | undefined;
    const resolver: SecretResolver = (name) => {
      calledWith = name;
      return Promise.resolve(ok('resolved-value'));
    };

    await resolveAuthHeaders([{ name: 'Authorization', secretName: 'my-secret' }], resolver);

    expect(calledWith).toBe('my-secret');
  });
});

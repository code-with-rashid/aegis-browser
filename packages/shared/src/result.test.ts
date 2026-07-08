import { describe, expect, it } from 'vitest';

import { andThen, err, isErr, isOk, map, mapErr, ok, unwrap, unwrapOr } from './result';

describe('result', () => {
  it('ok() creates a success result', () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  it('err() creates a failure result', () => {
    const result = err('boom');
    expect(result).toEqual({ ok: false, error: 'boom' });
    expect(isOk(result)).toBe(false);
    expect(isErr(result)).toBe(true);
  });

  it('map() transforms the success value', () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
  });

  it('map() passes through an error unchanged', () => {
    expect(map(err<string>('boom'), (n: number) => n * 2)).toEqual(err('boom'));
  });

  it('mapErr() transforms the error value', () => {
    expect(mapErr(err('boom'), (message) => message.length)).toEqual(err(4));
  });

  it('mapErr() passes through a success unchanged', () => {
    expect(mapErr(ok<number>(5), (message: string) => message.length)).toEqual(ok(5));
  });

  it('andThen() chains a success into another Result', () => {
    expect(andThen(ok(2), (n) => ok(n + 1))).toEqual(ok(3));
  });

  it('andThen() short-circuits on the first error', () => {
    expect(andThen(err<string>('boom'), (n: number) => ok(n + 1))).toEqual(err('boom'));
  });

  it('unwrapOr() returns the value on success', () => {
    expect(unwrapOr(ok(1), 0)).toBe(1);
  });

  it('unwrapOr() returns the fallback on error', () => {
    expect(unwrapOr(err('boom'), 0)).toBe(0);
  });

  it('unwrap() returns the value on success', () => {
    expect(unwrap(ok(1))).toBe(1);
  });

  it('unwrap() throws the error on failure', () => {
    expect(() => unwrap(err(new Error('boom')))).toThrow('boom');
  });
});

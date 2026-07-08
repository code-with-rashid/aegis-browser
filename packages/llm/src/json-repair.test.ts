import { describe, expect, it } from 'vitest';

import { isErr, isOk } from '@aegis/shared';

import { parseAndRepairJson } from './json-repair';

describe('parseAndRepairJson', () => {
  it('parses plain, well-formed JSON', () => {
    const result = parseAndRepairJson('{"a": 1}');
    expect(isOk(result) && result.value).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a ```json fenced code block', () => {
    const result = parseAndRepairJson('```json\n{"a": 1}\n```');
    expect(isOk(result) && result.value).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a plain fenced code block', () => {
    const result = parseAndRepairJson('```\n{"a": 1}\n```');
    expect(isOk(result) && result.value).toEqual({ a: 1 });
  });

  it('repairs trailing commas', () => {
    const result = parseAndRepairJson('{"a": 1, "b": 2,}');
    expect(isOk(result) && result.value).toEqual({ a: 1, b: 2 });
  });

  it('repairs a truncated / partial object', () => {
    const result = parseAndRepairJson('{"a": 1, "b": 2');
    expect(isOk(result) && result.value).toEqual({ a: 1, b: 2 });
  });

  it('extracts a JSON object surrounded by prose with no code fence', () => {
    const result = parseAndRepairJson('Sure, here you go: {"a": 1} — hope that helps!');
    expect(isOk(result) && result.value).toEqual({ a: 1 });
  });

  it('parses a JSON array', () => {
    const result = parseAndRepairJson('[1, 2, 3]');
    expect(isOk(result) && result.value).toEqual([1, 2, 3]);
  });

  it('wraps unstructured prose as a JSON string rather than failing', () => {
    // jsonrepair is deliberately permissive: bare text becomes a JSON string literal.
    // Callers still catch this because it won't validate against an object/array schema.
    const result = parseAndRepairJson('this is not JSON at all');
    expect(isOk(result) && result.value).toBe('this is not JSON at all');
  });

  it('returns an error for input with no recoverable structure', () => {
    const result = parseAndRepairJson('{{{{');
    expect(isErr(result)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { jsonSchemaToZod } from './json-schema-to-zod';

describe('jsonSchemaToZod', () => {
  it('converts a flat object schema with required and optional string properties', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        city: { type: 'string' },
        country: { type: 'string' },
      },
      required: ['city'],
    });

    expect(schema.safeParse({ city: 'London' }).success).toBe(true);
    expect(schema.safeParse({ city: 'London', country: 'UK' }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ city: 123 }).success).toBe(false);
  });

  it('converts number, integer, and boolean properties', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        count: { type: 'integer' },
        price: { type: 'number' },
        active: { type: 'boolean' },
      },
      required: ['count', 'price', 'active'],
    });

    expect(schema.safeParse({ count: 3, price: 4.5, active: true }).success).toBe(true);
    expect(schema.safeParse({ count: 3.5, price: 4.5, active: true }).success).toBe(false);
  });

  it('converts an array property', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
      required: ['tags'],
    });

    expect(schema.safeParse({ tags: ['a', 'b'] }).success).toBe(true);
    expect(schema.safeParse({ tags: [1, 2] }).success).toBe(false);
  });

  it('converts a string enum property', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { unit: { type: 'string', enum: ['celsius', 'fahrenheit'] } },
      required: ['unit'],
    });

    expect(schema.safeParse({ unit: 'celsius' }).success).toBe(true);
    expect(schema.safeParse({ unit: 'kelvin' }).success).toBe(false);
  });

  it('converts a nested object property', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        location: {
          type: 'object',
          properties: { lat: { type: 'number' }, lon: { type: 'number' } },
          required: ['lat', 'lon'],
        },
      },
      required: ['location'],
    });

    expect(schema.safeParse({ location: { lat: 1, lon: 2 } }).success).toBe(true);
    expect(schema.safeParse({ location: { lat: 1 } }).success).toBe(false);
  });

  it('falls back to unknown for an unrecognized property type, without failing the whole schema', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        known: { type: 'string' },
        weird: { oneOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['known'],
    });

    expect(schema.safeParse({ known: 'x', weird: { anything: 'goes' } }).success).toBe(true);
    expect(schema.safeParse({ known: 'x' }).success).toBe(true);
  });

  it('falls back to an open record when the top-level schema is not type:"object"', () => {
    const schema = jsonSchemaToZod({ type: 'string' });

    expect(schema.safeParse({ anything: 'goes' }).success).toBe(true);
  });

  it('accepts an object schema with no properties at all', () => {
    const schema = jsonSchemaToZod({ type: 'object' });

    expect(schema.safeParse({}).success).toBe(true);
  });
});

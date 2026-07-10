import { z } from 'zod';

/**
 * A minimal, best-effort JSON Schema → Zod converter, covering the shapes MCP tools
 * commonly declare (a flat or shallowly-nested object of string/number/boolean/array/
 * enum properties). Anything it doesn't recognize falls back to `z.unknown()` for that
 * one property (never fails the whole conversion) — the real validation for an MCP tool
 * call ultimately happens server-side anyway; this only needs to be good enough to (a)
 * give the Navigator useful shape information and (b) catch obviously-wrong args before
 * a network round-trip.
 */
function convertProperty(value: unknown): z.ZodType {
  if (typeof value !== 'object' || value === null) {
    return z.unknown();
  }
  const schema = value as Record<string, unknown>;

  if (Array.isArray(schema['enum']) && schema['enum'].every((v) => typeof v === 'string')) {
    const values = schema['enum'] as readonly string[];
    if (values.length > 0) {
      return z.enum(values as [string, ...string[]]);
    }
  }

  switch (schema['type']) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(convertProperty(schema['items']));
    case 'object':
      return convertObjectSchema(schema);
    default:
      return z.unknown();
  }
}

function convertObjectSchema(schema: Record<string, unknown>): z.ZodType {
  const properties =
    typeof schema['properties'] === 'object' && schema['properties'] !== null
      ? (schema['properties'] as Record<string, unknown>)
      : {};
  const required = Array.isArray(schema['required'])
    ? (schema['required'] as readonly unknown[]).filter((r): r is string => typeof r === 'string')
    : [];

  const shape: Record<string, z.ZodType> = {};
  for (const [key, propertySchema] of Object.entries(properties)) {
    const converted = convertProperty(propertySchema);
    shape[key] = required.includes(key) ? converted : converted.optional();
  }
  return z.object(shape);
}

/**
 * Converts an MCP tool's declared JSON Schema (always `type: "object"` at the top level,
 * per the MCP spec) to a Zod schema for `Tool.inputSchema`. A non-object top-level schema
 * (shouldn't happen for a spec-conformant server, but a hostile/broken one might) falls
 * back to accepting any object.
 */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  if (schema['type'] !== 'object') {
    return z.record(z.string(), z.unknown());
  }
  return convertObjectSchema(schema);
}

/**
 * Recursively rewrites every string leaf in `value` via `mapper` — arrays and plain
 * objects are walked, everything else (`number`/`boolean`/`null`/`undefined`) passes
 * through unchanged. `WorkflowStep.args` is `unknown` (a browser action or an arbitrary
 * MCP/WebMCP tool's args shape), so parameterizing/resolving it can't rely on
 * `@aegis/security`'s `resolveActionSecrets` (which is hardcoded to the known `Action`
 * union's specific fields) — this is the generic equivalent for arbitrary JSON-like args
 * (`docs/adr/0044-workflow-parameterization.md`).
 */
export function mapStringsDeep(value: unknown, mapper: (text: string) => string): unknown {
  if (typeof value === 'string') {
    return mapper(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => mapStringsDeep(entry, mapper));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, mapStringsDeep(entry, mapper)]),
    );
  }
  return value;
}

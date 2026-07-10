# 0006 — Navigator uses a transform-free mirror of `ActionSchema` for LLM output

> **Superseded by [ADR 0029](0029-tool-calling-agent-loop.md)** (Phase 2, issue #81):
> `navigator/llm-action-schema.ts` is deleted. The Navigator's wire schema is now generic
> tool calls (`{toolId, args: z.unknown()}`), so there's no per-action union to mirror;
> each tool's schema is instead rendered as prompt text via `z.toJSONSchema(...,
{unrepresentable: 'any'})`, which sidesteps the same `.transform()` limitation this ADR
> describes without needing a parallel schema at all. Kept below for historical context.

## Context

The Navigator (#17) needs `generateStructured` (#5) to validate the model's proposed
actions directly against `@aegis/actions`' real `ActionSchema` — reusing the actual
action schemas, not hand-written duplicates, was the obvious first design. That failed
at runtime: `generateStructured` calls `z.toJSONSchema(schema)` to build the model's
format instructions, and Zod v4 cannot represent a `.transform()` in JSON Schema —
`ActionSchema`'s `ref` field is `z.string().min(1).transform(toElementRef)` (branding a
plain string as the nominal `ElementRef` type), and `z.toJSONSchema` throws
`"Transforms cannot be represented in JSON Schema"` the moment it encounters it.

## Decision

`navigator/llm-action-schema.ts` defines `LlmActionSchema`: the same 14 action schemas,
each imported directly from `@aegis/actions` and `.extend()`-ed to override only the
`ref` field with a plain `z.string().min(1)` (no transform). This is passed to
`generateStructured` instead of `ActionSchema`. After a successful call, the raw
`actions` array (plain-string refs) is re-parsed through the real `ActionSchema`
(`z.array(ActionSchema).safeParse(...)`) to get properly-branded `Action`s — the actual
runtime validation and branding still goes through `@aegis/actions`' source of truth; the
mirror exists only to make the JSON-schema-generation step possible.

## Consequences

- `.extend()`-ing the real per-action schemas (rather than hand-writing all 14 shapes
  from scratch) means any field added to an action schema later propagates to the mirror
  automatically — only `ref` needs to stay manually synced, and it's a plain string in
  both places, so there's nothing to actually keep in sync.
- Any other schema passed to `generateStructured` must avoid `.transform()`/`.pipe()` for
  the same reason — worth remembering if a future issue (e.g. a schema producing another
  branded type) hits the same JSON Schema limitation.

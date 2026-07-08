# 0002 — `generateStructured` parses/repairs JSON itself instead of using the AI SDK's object-output mode

## Context

`BUILD_PROMPT.md` (#5) specifies `generateStructured(schema, prompt)` "using
`generateObject`". In the installed AI SDK version (`ai@7`), `generateObject` /
`streamObject` are deprecated in favor of `generateText`/`streamText` with an `output:
Output.object({ schema })` option — but neither approach exposes a repair/retry hook for
malformed JSON (no `repairText`-style callback), and reliability varies by provider/model
(some — especially smaller local models served through the OpenAI-compatible/Ollama
adapter — don't reliably honor strict JSON-mode constraints at all).

The whole point of this issue is "never crash on imperfect model JSON (Nanobrowser's #1
bug)" — i.e. building our own robustness layer, not trusting a provider's structured-output
mode to already be robust.

## Decision

`generateStructured` is built entirely on top of the plain-text `LlmProvider.generateText`
from issue #4:

1. Ask the model for JSON via prompt instructions (a JSON Schema generated from the Zod
   schema with `z.toJSONSchema`), not the SDK's `output` option.
2. Parse the response with `parseAndRepairJson` (`json-repair.ts`): strip markdown fences,
   extract a bracketed substring from surrounding prose, try `JSON.parse`, then fall back
   to the `jsonrepair` library (trailing commas, truncated/partial objects, etc.).
3. Validate with the Zod schema; on a parse or validation failure, retry (up to
   `maxRetries`, default 2) with the model's own bad output and the specific problem fed
   back into the next prompt.

## Consequences

- Uniform behavior across every provider/model, including ones with weak or nonexistent
  native JSON-mode support (a real concern for the Ollama/OpenAI-compatible presets).
- No dependency on `generateObject`/`Output.object` at all, so this doesn't need
  revisiting if the SDK removes the deprecated `generateObject` entirely in a future major.
- Adapters and the `LlmProvider` interface from issue #4 are unchanged — `generateStructured`
  is an additional pure function in `@aegis/llm`, not a new adapter method.

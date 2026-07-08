# @aegis/llm

Provider-agnostic LLM access, BYOK. Hosts the `LlmProvider` interface, Vercel AI SDK
adapters for OpenAI, Anthropic, Google, Ollama (via the OpenAI-compatible adapter — see
`docs/adr/0001-ollama-via-openai-compatible.md`) and generic OpenAI-compatible endpoints,
a `ProviderRegistry` that turns a Zod-validated `ProviderConfig` into a working
`LlmProvider`, and a `MockProvider` for tests.

`generateText` calls run through a shared `runGenerateText` helper that adds
timeout/abort support (`AbortSignal.timeout` combined with a caller-supplied signal) and
maps failures into a typed `LlmError` (`LLM_TIMEOUT | LLM_ABORTED | LLM_REQUEST_FAILED | LLM_INVALID_CONFIG`).
No adapter ever logs or otherwise surfaces a raw API key.

`generateStructured(provider, schema, prompt, options?)` layers schema-validated output
on top of plain `generateText` — no dependency on the AI SDK's own (deprecated)
`generateObject`, see `docs/adr/0002-structured-output-via-prompted-json-not-sdk-object-mode.md`.
It prompts for JSON matching a schema derived via `z.toJSONSchema`, parses the response
with `parseAndRepairJson` (`json-repair.ts` — strips markdown fences, extracts JSON from
surrounding prose, falls back to the `jsonrepair` library for trailing commas/truncated
objects), and retries with schema-violation feedback up to `maxRetries` (default 2)
before returning a typed `LLM_STRUCTURED_PARSE_FAILED` / `LLM_STRUCTURED_VALIDATION_FAILED`
error.

Per-agent-role model routing lands in a later issue (#6) on top of this same
`LlmProvider` surface.

Depends on `@aegis/shared`.

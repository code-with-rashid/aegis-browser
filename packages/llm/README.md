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

`createModelRouter(createProvider, config)` assigns a distinct provider+model+params to
each agent role (`planner | navigator | verifier | critic`) via a Zod-validated
`ModelRoutingConfig`. `createProvider` is typically `registry.create.bind(registry)`
(injected rather than a concrete `ProviderRegistry` dependency, so routing logic is
testable without real provider adapters). The resolved `LlmProvider` auto-applies each
role's configured (or role-default) temperature/`maxOutputTokens` unless a caller
overrides them per-request — Planner runs hotter (more exploratory re-planning), Navigator/
Verifier/Critic run cold (narrow, low-variance judgment calls). There is no default
_provider_ (BYOK means the user always configures one), only default params.
`saveModelRoutingConfig`/`loadModelRoutingConfig` persist it through any `StoragePort`.

Depends on `@aegis/shared`.

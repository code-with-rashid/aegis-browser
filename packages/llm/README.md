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

Structured output (`generateStructured` + JSON-repair) and per-agent-role model routing
land in later issues (#5, #6) on top of this same `LlmProvider` surface.

Depends on `@aegis/shared`.

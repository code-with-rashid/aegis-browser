# @aegis/llm

Provider-agnostic LLM access. Hosts the `LlmProvider` interface, Vercel AI SDK adapters
for OpenAI, Anthropic, Google, Ollama and generic OpenAI-compatible endpoints, a
`ProviderRegistry`, a `MockProvider` for tests, `generateStructured` (schema-validated
output with JSON-repair and bounded retries), and per-agent-role model routing.

Depends on `@aegis/shared`.

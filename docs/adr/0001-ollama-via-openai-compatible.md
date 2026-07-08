# 0001 — Support Ollama via the generic OpenAI-compatible adapter

## Context

`BUILD_PROMPT.md` (#4) lists AI SDK adapters for "OpenAI, Anthropic, Google, Ollama, and
generic OpenAI-compatible" as five distinct items. Ollama has no official `@ai-sdk/*`
package; the community options (`ollama-ai-provider-v2`, `ai-sdk-ollama`) add a
dependency whose only job is to talk to Ollama's native API. Ollama also serves an
OpenAI-compatible HTTP endpoint at `/v1` out of the box.

## Decision

Implement Ollama support as a thin preset over `createOpenAiCompatibleProvider`
(`packages/llm/src/adapters/ollama-provider.ts`), defaulting `baseUrl` to
`http://localhost:11434/v1` and passing a placeholder API key (Ollama does not validate
it). No dedicated Ollama SDK dependency is added.

## Consequences

- One fewer third-party dependency to vet and keep in sync with AI SDK core version
  bumps; one code path (`openai-compatible`) to test for both "generic" and "Ollama"
  configs.
- Users pointing Aegis at a real Ollama install work out of the box with the default
  `baseUrl`; advanced Ollama features exposed only through a native client (if any) are
  out of scope for the MVP.
- If Ollama's OpenAI-compatible endpoint ever lags behind its native API in capability,
  revisit by swapping in `ollama-ai-provider-v2` behind the same `createOllamaProvider`
  factory — the `ProviderRegistry` / `LlmProvider` public surface does not change.

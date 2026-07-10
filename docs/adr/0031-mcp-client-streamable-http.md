# 0031 — MCP client over Streamable HTTP, with a real local server as its test double

## Context

Issue #83 (Phase 2, M9) asks for an `McpClient` connecting to MCP servers over Streamable
HTTP (a browser extension can't spawn stdio child processes, ruling out that transport
entirely), using the official `@modelcontextprotocol/sdk`, with typed, distinguishable
errors for timeout/cancellation/protocol failure and a `MockMcpServer` test double.

## Decision

- **`createMcpClient` wraps the SDK's `Client` + `StreamableHTTPClientTransport`
  directly** — no home-grown JSON-RPC or SSE parsing. `McpClient`'s four methods
  (`connect`/`listTools`/`callTool`/`disconnect`) all return `Result<T, McpClientError>`;
  nothing throws.
- **Error classification is necessarily message-text-sensitive in one case.** The SDK
  reports both a genuine request timeout and the caller's own `AbortSignal` firing
  through the _identical_ `McpError` code (`RequestTimeout`, -32001) — there is no
  structural field distinguishing them, only the error's message text ("Request timed
  out" vs. "AbortError: This operation was aborted"). `toMcpClientError` checks for this
  text, which is fragile against a future SDK wording change but is the only signal
  available; if the SDK ever adds a structural distinction, prefer it over this check.
  A response that fails MCP schema validation (e.g. the configured URL answers with
  non-MCP JSON) surfaces as a `ZodError`, not an `McpError` — classified as
  `MCP_PROTOCOL_ERROR` by name-checking `cause.name === 'ZodError'`, the same
  message/structural-signal tradeoff.
- **Calling an unknown tool name is not a client-level error at all.** Per MCP
  convention (and this SDK's `McpServer` implementation), it comes back as a normal `Ok`
  `McpToolCallResult` with `isError: true` and explanatory text content — the RPC call
  itself succeeded; the _tool_ failed. Only a genuine transport/protocol/connection
  problem produces an `Err`. A caller (#85) that wants to treat an unknown tool specially
  should check `isError`, not expect a distinct error code.
- **`MockMcpServer` is a real local HTTP server**, not an in-process stub: `McpServer`
  (the SDK's high-level server API) connected to a real `StreamableHTTPServerTransport`,
  bound to `127.0.0.1` on an OS-assigned ephemeral port via Node's own `http.createServer`
  — matching this codebase's existing fake-model-server convention (ADR 0019). This
  genuinely exercises `McpClient`'s real Streamable HTTP transport code (headers, the
  actual wire protocol), not just its call-shape plumbing against a hand-rolled fake.
- **The mock server runs in stateful mode** (`sessionIdGenerator: () => randomUUID()`),
  not the SDK's documented stateless mode (`sessionIdGenerator: undefined`). Empirically,
  stateless mode's `notifications/initialized` follow-up request fails with an
  unexplained HTTP 500 under this SDK version's Node HTTP bridge (`@hono/node-server`) —
  a session id per connection sidesteps this, and it's also the more representative
  choice, since a real-world MCP server commonly tracks sessions. Worth re-testing
  stateless mode against a future SDK upgrade in case this was a version-specific bug.

## Consequences

- `packages/mcp` now depends on `@modelcontextprotocol/sdk` and `zod`; `zod` was already
  a monorepo-wide dependency (Zod v4) elsewhere, so no version conflict.
- Several `exactOptionalPropertyTypes`-vs-the-SDK's-own-`.d.ts` friction points needed
  explained `as`/`as unknown as` casts (`Transport`, `StreamableHTTPServerTransportOptions`,
  `CallToolResultSchema`'s generic resolution) — the SDK's declarations weren't authored
  under that compiler flag. Each cast has an inline comment explaining exactly why it's
  needed, so a future SDK upgrade that fixes the root cause makes the cast's obsolescence
  easy to spot and remove.
- No secrets (auth headers) ever appear in a constructed `McpClientError`'s message or
  `cause` chain — proven directly by a test that configures a fake bearer token, forces a
  connection failure, and asserts the token never appears in the error's JSON.

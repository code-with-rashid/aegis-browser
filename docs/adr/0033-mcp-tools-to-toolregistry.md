# 0033 — MCP tools bridge into the ToolRegistry: risk inference, schema conversion, elicitation

## Context

Issue #85 (Phase 2, M9) is the payoff for #80 (unified `Tool`/`ToolRegistry`), #83 (MCP
client), and #84 (MCP server config): connect to a configured, enabled MCP server, list
its tools, and register each as a `source: "mcp"` `Tool` the Navigator can already call
(#81) and the policy engine can already gate (#82). Three sub-problems fall out of that:
a tool's JSON Schema input needs to become the Zod schema `Tool.inputSchema` requires; a
tool's risk needs to come from _somewhere_ since an MCP server has no page-element
context to elevate from; and MCP's optional "elicitation" feature (a server asking the
human for input mid-call) needs a place to plug in even though nothing calls it yet.

## Decision

- **Risk is inferred from MCP tool annotations, failing safe.** `readOnlyHint: true` (and
  not also `destructiveHint`) maps to `read`; a server declaring `destructiveHint: true`,
  or declaring neither hint at all, maps to `state_changing`. This mirrors
  `ToolRegistry.classify`'s existing "unknown risk denies by default" convention (#82) —
  a server that says nothing about its own safety gets treated as the riskier of the two
  tiers, so it can't silently skip confirmation.
- **JSON Schema → Zod conversion is minimal and permissive, not a general-purpose
  library.** `jsonSchemaToZod` (`packages/mcp/src/registry/json-schema-to-zod.ts`) handles
  the shapes MCP tool schemas actually use in practice — flat and nested objects,
  string/number/integer/boolean/array/enum properties, required vs. optional — and falls
  back to `z.unknown()` per-property (or `z.record(z.string(), z.unknown())` for a
  non-object top-level schema) for anything else. A property this converter doesn't
  recognize still validates successfully; it just doesn't narrow the type, so a
  hallucinated-but-schema-valid call can still reach the MCP server, which is no worse
  than not validating that property at all. Reaching for a full JSON-Schema-to-Zod
  package would pull in a dependency to handle exotic schema features (`$ref`,
  `oneOf`/`allOf` composition, conditionals) that no MCP tool observed so far actually
  emits.
- **Tool ids are namespaced `mcp.<server>.<tool>`**, where `<server>` is the configured
  server's display `name`, lowercased and stripped to `[a-z0-9_]` (`toIdSegment`). This
  keeps ids stable and human-readable in the trace/confirmation UI (#90) even though two
  different servers could otherwise expose a tool with the same bare name (e.g. two
  different servers both exposing `search`).
- **One `McpClient` connection is shared by every tool registered from that server, kept
  open for the tools' lifetime.** `registerMcpServerTools` returns a
  `RegisteredMcpServerTools` with the resulting `toolIds` and a `disconnect()` — the
  composition root calls `disconnect()` when a server is disabled/removed or the
  extension tears down. Reconnecting per-call would need a handshake per tool
  invocation for no benefit, since nothing in this codebase runs multiple concurrent
  calls against the same MCP server today.
- **Elicitation is wired as an optional `onElicitationRequest` handler on
  `CreateMcpClientOptions`, not built out into a UI yet.** `McpClient.connect()` only
  advertises the `elicitation` capability when a handler is supplied; a server that
  supports elicitation but talks to a client that didn't opt in simply never asks. This
  keeps the feature inert (and untested against a real confirmation UI) until #90 wires
  a real handler through the existing confirmation gate — but the plumbing (request/
  response types, capability negotiation, the SDK's request-handler registration) is in
  place now rather than deferred to a later refactor of `mcp-client.ts`.

## Consequences

- `@aegis/mcp` now depends on `@aegis/actions` (for `Tool`/`ToolRegistry`/
  `ToolExecutionError`) — the first cross-package dependency this package has taken
  on, and one the layering rules already anticipate (`agent`/`security` → `actions` →
  `perception` → `llm` → `shared`; `mcp` sits alongside `actions` as another tool
  source).
- A tool whose declared JSON Schema this converter can't fully represent still works;
  it just validates more loosely than a hand-written Zod schema would. This is an
  accepted, documented trade rather than a silent gap.
- Elicitation has no caller-facing behavior yet — `onElicitationRequest` is exercised
  only by `mcp-tool-registry.test.ts`'s round-trip test today. Routing it through the
  real confirmation gate is explicitly #90's job, not this issue's.

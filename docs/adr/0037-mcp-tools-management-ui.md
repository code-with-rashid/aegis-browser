# 0037 — Tools & MCP management UI: closes the MCP-server composition-root gap, surfaces a real cross-process vault limitation

## Context

Issue #89 (Phase 2, M11) asks for an options-page panel to add/enable/disable/remove MCP
servers, view their discovered tools and schemas, toggle WebMCP globally, and set
per-tool allow/deny — all taking effect at runtime, no reload. Investigating this
surfaced that, unlike WebMCP (wired into `buildLoopServices` in #88), **no configured MCP
server has ever been connected to a live running task** — #85/#86 built
`registerMcpServerTools`/the deny-by-default gate and explicitly deferred the
composition-root wiring, and nothing closed that gap since. A UI to manage servers no one
ever connects to would be pointless, so this issue closes both gaps together.

## Decision

- **`build-loop-services.ts` gains `registerConfiguredMcpServers`**: lists every
  `McpServerStore` entry (`@aegis/mcp`, #84) and calls `registerMcpServerTools` for each —
  a disabled server is already a no-op inside that function (#86), so this loop doesn't
  need its own enabled-check. One server's failure (unreachable, bad auth, a locked
  vault) never blocks another or task start, the same principle already applied to
  WebMCP. Every registration's `disconnect()` is called in `detach()`.
- **WebMCP gains a global on/off toggle** (`createWebMcpSettingsStore`, `@aegis/mcp`,
  defaults to enabled): `buildLoopServices` checks it before calling `registerWebMcpTools`
  at all — off means no page's tools are ever registered, regardless of what any page
  declares. A settings-read failure fails _open_ (enabled) — this is a preference, not a
  security boundary; every tool call still passes through the same risk-based
  policy/critic/confirmation gate either way.
- **Discovering a server's tools reuses `testMcpServerConnection`** (#84) exactly as
  built — it already returns the connected server's `McpToolDescriptor[]`, so "view
  discovered tools with their input schemas" needed no new `@aegis/mcp` code, just a
  "Discover tools" button rendering what it returns (name, description, JSON schema,
  inferred risk via the already-existing `inferMcpToolRisk`).
- **A newly-exported `buildMcpToolId`/`toIdSegment`** (`@aegis/mcp`, previously internal
  to `registry/tool-id.ts`) let the UI compute the _exact_ same tool id
  (`mcp.<server>.<tool>`) `registerMcpServerTools` uses internally, so per-tool
  allow/deny controls read/write the same `McpToolPolicyStore` records a live run
  consults — no second id-computation to drift out of sync.
- **A real, surfaced limitation: the background has no way to use an _unlocked_ vault.**
  `SecretVault`'s derived key lives only in memory, per-process (ADR 0012); the options
  page's vault instance and any future background-process vault instance can never share
  that unlocked state — they're separate JS realms. `registerConfiguredMcpServers`
  constructs its own fresh `SecretVault` from the same storage, which is _always locked_
  in that process. In practice, this only matters for a server whose `authHeaders` is
  non-empty: `resolveAuthHeaders` short-circuits to an empty map without ever touching the
  vault when a server has none, so an MCP server needing no auth (a very plausible case
  for a local/dev server) registers and works exactly as expected; one that needs an auth
  header cannot, today, actually connect from a live task, even though the SAME header
  resolves fine from the options page's "Discover tools" button (which uses the options
  page's own, unlockable vault instance). This is a genuine, pre-existing, cross-cutting
  gap (it equally affects `input_text`/`send_keys` secret placeholders, which — a
  separate discovery made investigating this issue — also have _zero_ callers wiring
  `resolveActionSecrets` into any live run today) that a UI issue is not the right place
  to fix; it's flagged here, honestly, rather than silently worked around.
- **The auth-header form supports at most one header**, not a dynamic list — a single
  bearer/API-key header covers the common case; a server needing more is rare enough not
  to justify the added form complexity for this first pass at the UI.

## Consequences

- `apps/extension`'s background and options bundles both grew (background ~755KB → ~955KB,
  options ~666KB → ~869KB) from the new `@aegis/mcp` surface each now imports — expected,
  legitimate growth (composition-root wiring + a real management UI), unlike #87's
  ~215KB-per-content-script bug, which was dead-code bloat from a missing
  `sideEffects: false`, not real functionality.
- A user can add an MCP server, discover its tools, and allow/deny them entirely from the
  options page; the very next task start on any tab picks up the change, since
  `buildLoopServices` reads every store fresh, with no caching layer anywhere to
  invalidate.
- An MCP server requiring an auth header remains effectively unusable in a live task until
  cross-process vault access is designed and built — a real, sized follow-up, not a
  same-issue fix. The options page still lets a user _configure_ such a server and verify
  its auth header resolves correctly via "Discover tools" (using the options page's own
  vault) — only the live-task path is blocked, and the exact `VAULT_LOCKED` failure mode
  is what surfaces if it's attempted.

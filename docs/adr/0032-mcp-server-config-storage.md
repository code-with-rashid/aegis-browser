# 0032 — MCP server config: url-keyed storage, vault references never values

## Context

Issue #84 (Phase 2, M9) asks for user-managed MCP server configuration: name, HTTP URL,
auth headers resolved from the vault, an enabled flag, persisted storage, and a
connection test. `@aegis/mcp` (built in #83) has no dependency on `@aegis/security` today
— the question this issue has to answer is how "auth headers → vault" works without
introducing one.

## Decision

- **`McpServerConnectionConfig` is keyed by `url`**, not a generated id — the same
  natural-key pattern `@aegis/security`'s `SitePolicy` already uses (keyed by origin). A
  user configuring the same MCP endpoint twice is meant to edit the existing entry, not
  create a duplicate; this also means `createMcpServerStore` needs no id-generation
  scheme at all.
- **Auth headers store a `secretName` reference, never a header value.** This is the
  same discipline `@aegis/security`'s vault already applies to `input_text`/`send_keys`
  (`docs/adr/0012-secret-vault.md`) — the raw value never enters persisted storage, and
  (per #83's ADR 0031) never enters a constructed error either.
- **Resolution is an injected function (`SecretResolver`), not a vault import.**
  `@aegis/mcp` stays a sibling of `@aegis/security`, never importing it directly (the
  same boundary ADR 0010 established between `@aegis/agent` and `@aegis/security`).
  `SecretResolver = (secretName) => Promise<Result<string, SecretResolveError>>` is a
  plain function type; the composition root (`apps/extension`, wired starting #85) is
  where `(name) => vault.getSecret(name)` actually appears. `SecretResolveError` is a
  plain `{message: string}` shape, not an imported `VaultError` class, for the same
  reason.
- **`createMcpServerStore` mirrors `@aegis/security`'s `PolicyStore` exactly**: one
  `Record<url, McpServerConnectionConfig>` under a single storage key, `getServer`/
  `saveServer` (upsert, so "add" and "edit" are the same operation)/`removeServer`/
  `listServers`. Appropriate for the same reason it's appropriate for site policies — a
  user configures a handful of MCP servers, not enough to need a key-per-server.
- **`testMcpServerConnection` performs the exact three steps a real tool-registry wiring
  will perform** (resolve headers → connect → list tools), always disconnecting
  afterward via `finally`, whether the test failed after connecting or not. This makes a
  passing connection test a genuine predictor that enabling the server will work, not
  just a syntactic check.

## Consequences

- `@aegis/mcp`'s only dependencies remain `@aegis/shared`, `@modelcontextprotocol/sdk`,
  and `zod` — no new cross-package coupling.
- The eventual `ToolRegistry` wiring (#85) and the management UI (#89) both consume
  `McpServerStore`/`testMcpServerConnection` directly; #85 additionally needs its own
  `SecretResolver` closure over the real vault, which is a one-line composition-root
  change once the vault is available in that context.
- A saved server config with no `authHeaders` connects with no extra headers at all
  (`testMcpServerConnection` only passes a `headers` object to `createMcpClient` when
  the resolved map is non-empty) — an MCP server that needs no auth works with zero
  vault interaction.

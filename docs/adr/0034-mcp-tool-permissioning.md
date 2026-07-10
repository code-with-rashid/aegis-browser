# 0034 — MCP tool permissioning: deny-by-default admission gate, per-server enable, trace audit

## Context

Issue #86 (Phase 2, M9) asks for three things: per-server and per-tool allow/deny for MCP
tools, a deny-by-default rule for tools discovered between sessions, and an audit trail in
the trace for every MCP tool call. `registerMcpServerTools` (#85) registers every tool a
connected server declares unconditionally — there is no gate at all today. Separately,
`buildTraceStep` (`packages/agent/src/loop/trace.ts`, since #14) has a latent bug: it
indexes `context.proposedActions` (a browser-tool-only subset, per `DecideOutput.actions`'
own doc-comment) positionally against `context.lastRunSummary.toolCalls` (every tool call,
any source) — the two arrays are only ever the same length by coincidence, because no
non-browser tool call has ever run through the loop yet. Any MCP tool call would silently
misalign against whatever browser action happened to sit at the same index.

There is no runtime wiring today that connects a configured `McpServerConnectionConfig`
into the live extension at all (`apps/extension` doesn't depend on `@aegis/mcp`, and no
options-page panel exists to configure one) — that composition-root wiring, together with
a UI to review pending tools, is explicitly #89's job (blocked by this issue). This issue
builds and thoroughly tests the mechanism `@aegis/mcp`/`@aegis/agent` need; it does not
wire a live MCP server into the running extension, since there would be no way to exercise
that wiring without #89's UI anyway.

## Decision

- **A new `McpToolPolicy` store in `@aegis/mcp`** (`policy/mcp-tool-policy.ts`,
  `policy/mcp-tool-policy-store.ts`) mirrors `@aegis/security`'s `SitePolicy`/`PolicyStore`
  shape as closely as it practically can: `{toolId, mode: "allow" | "deny"}`, one storage
  record holding `Record<toolId, McpToolPolicy>`. It's a new, local type — not a reused
  `@aegis/security` import — since `@aegis/mcp` stays a sibling of `@aegis/security` (the
  boundary ADR 0010 established, reaffirmed by ADR 0032). Unlike `SitePolicy`, there is no
  `ask`/`confirm` mode: this is a one-time "may this tool exist at all" admission gate, not
  the per-call risk gate `@aegis/security`'s `PolicyEngine` already runs on every allowed
  tool call (#82) — those two gates compose (a tool must pass both), not merge into one.
  It's keyed by `Tool.id` (`mcp.<server>.<tool>`) rather than a separate `(server, tool)`
  pair, reusing the id `@aegis/actions`' `ToolRegistry` already uses.
- **`gateMcpTools` (`policy/gate-mcp-tools.ts`) is the deny-by-default admission gate**: a
  tool id with no stored policy is recorded `mode: "deny"` on the spot (so it shows up in
  a future "pending review" list, #89) and excluded; an explicitly `deny`d tool stays
  excluded; only an explicitly `allow`ed tool passes through. No tool is ever auto-trusted
  — a server exposing a new tool between sessions doesn't change what's callable until a
  human explicitly allows it, satisfying the acceptance criterion directly.
- **`registerMcpServerTools` calls `gateMcpTools` after `listTools()`, before building any
  `Tool`** — only gated-`allowed` descriptors are ever turned into a `Tool` and registered.
  A denied (or merely undecided) tool is never registered at all, so it's neither offered
  to the Navigator (`ToolRegistry.list()`) nor callable (`ToolRegistry.call()` returns
  `TOOL_UNKNOWN`) — the acceptance criterion is satisfied structurally, not by a runtime
  check inside `execute()`. `RegisteredMcpServerTools` gains `newlyDiscoveredToolIds`, for
  a future management UI to prompt a decision on.
- **Per-server allow/deny reuses `McpServerConnectionConfig.enabled`** (already added in
  #84, previously unconsumed): `registerMcpServerTools` returns an empty, no-op
  registration immediately when `!config.enabled`, without ever attempting to connect.
  This was simpler and more directly testable than adding a separate orchestration
  function with no caller yet (see Consequences) — the one existing seam already carries
  exactly the flag needed.
- **The trace/audit fix corrects the underlying indexing bug and adds the fields the
  acceptance criteria ask for.** `buildTraceStep` now takes a `ToolRegistry` (and an
  optional `SanitizeText`, defaulting to the existing `identitySanitize`) and correlates
  `context.lastRunSummary.toolCalls[i]` with `context.proposedToolCalls[i]` — the
  authoritative, source-agnostic array the Navigator/`EDIT` machinery already keeps in
  lockstep (`docs/adr/0029-tool-calling-agent-loop.md`) — instead of the browser-only
  `proposedActions`. Each `TraceActionEntry` gains `toolId`, `source` (from
  `toolRegistry.get(toolId)?.source`), and `argsSummary` (a length-capped
  `JSON.stringify` of the call's args); the description itself now goes through the
  already-existing `describeToolCall` (built for the critic's prompt in #82), which
  already sanitizes an MCP/WebMCP tool's untrusted `description` and falls back to
  `describeAction` for a browser tool — so the trace and the critic prompt describe a
  tool call identically. `TraceStep` gains `policyDecision` (the security policy's
  `allow`/`confirm`/`deny` for the step's whole batch — the only granularity that exists,
  since `PolicyCheckOutput` is one decision per batch, not per call), threaded from a new
  `AgentLoopContext.policyDecision` field the `policyCheck` state now assigns on every one
  of its three outcomes (not just `confirm`, which is all `policyCheckReason` ever needed).
  Together, `{toolId, source, argsSummary, policyDecision}` cover "server, tool, args
  summary, decision" — `toolId` alone carries the server, since `mcp.<server>.<tool>`
  already namespaces it; no separate `server` field was added to avoid a second,
  potentially-divergent parse of the same id.

## Consequences

- `apps/extension/background/build-loop-services.ts`'s `BuiltLoop` now exposes the
  `ToolRegistry` it built `services` against, and `run-manager.ts` threads it (plus the
  real `sanitizePageContent`) into `buildTraceStep`. This is a real, needed fix — not
  MCP-specific — since the old `proposedActions`-indexed version was already wrong for
  any non-browser tool call, it was just never exercised.
- No live MCP server is wired into the running extension by this issue: there is still no
  `@aegis/mcp` dependency in `apps/extension`, and no options-page panel to configure a
  server or review a newly-discovered tool. `registerMcpServerTools`/`gateMcpTools` are
  fully built and tested end-to-end against a real (mock) MCP server, ready for #89 to
  call from a real composition root and expose through a UI — deferring that wiring avoids
  building a code path with no way to exercise it before a UI exists to drive it.
- A future `McpToolPolicy` UI (#89) can list every stored policy (`listPolicies()`) to
  show pending/allowed/denied tools per server, and flip a decision via `setPolicy` —
  `registerMcpServerTools` re-evaluates the gate fresh on every call (it doesn't cache),
  so a newly-allowed tool becomes registered the next time the server's tools are
  (re-)registered, with no separate invalidation mechanism needed.

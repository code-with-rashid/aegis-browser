# 0039 — E2E: MCP + WebMCP tasks, and a call-count proof for a non-page-bound confirmation

## Context

Issue #91 (Phase 2, M12) asks for Playwright coverage proving tool-use end to end, in CI:
a task completed via a real MCP tool, a task completed via a WebMCP fixture tool, and at
least one of the two flows asserting the confirmation gate genuinely blocks a
state-changing tool call — checked against real state, not just the loop's own
self-reported status, per the convention `docs/adr/0020-e2e-confirmation-gated-task.md`
already established for browser actions (`#purchased` staying hidden in `checkout.html`).
The WebMCP half was already built and already passes in CI as part of #88
(`apps/extension/e2e/webmcp-preferred-routing.spec.ts`, `docs/adr/0036-webmcp-preferred-action-routing.md`)
— that spec is what satisfies this issue's WebMCP scope item; nothing new was needed there.
The real gap was the MCP half, which had no E2E coverage at all.

## Decision

- **A new `apps/extension/e2e/mcp-tool-task.spec.ts`** drives the real built extension
  against a real `MockMcpServer` (`@aegis/mcp/testing`, already an `apps/extension`
  dependency) over genuine Streamable HTTP — not a stand-in for the MCP round trip, the
  actual `McpClient`/`registerMcpServerTools`/`gateMcpTools` path built across #83-#86.
- **A new `packages/eval-harness/src/seed-mcp-chrome-storage.ts` exports `seedMcpServer`**,
  mirroring `seedModelRoutingConfig`'s existing shape: writes an enabled
  `McpServerConnectionConfig` and an `allow` `McpToolPolicy` for each given tool id
  straight into `chrome.storage.local`, from outside the extension's module graph. This
  belongs in `@aegis/eval-harness` (not inlined in the spec) since the package's whole
  purpose is shared E2E/`evals/` plumbing, and a future tool-use eval (#92) will plausibly
  want the same seeding. It deliberately does **not** add `@aegis/mcp` as a dependency —
  the storage keys/shapes are inlined, the same choice `seed-chrome-storage.ts` already
  made for `@aegis/llm`, since this code runs outside the extension's module graph anyway.
- **One new, interaction-free fixture (`mcp-tool-task.html`)**, reused by both new
  scenarios: an MCP tool answers the task directly, so — unlike every other fixture in
  this harness — there is nothing in its DOM the task needs to touch; the fixture exists
  only so the loop has an active tab to attach to.
- **Two scenarios, one server each**: `mcp-tool-task` registers a `read`-risk
  `get_forecast` tool (`readOnlyHint: true`) that completes the task in one step with no
  confirmation; `mcp-tool-confirmation` registers a `place_order` tool with no
  annotations, so `@aegis/mcp`'s risk inference fail-safes it to `state_changing` (#85) —
  with no `SitePolicy` stored for the fixture's origin, the real policy engine defaults to
  `ask` (`docs/adr/0009-policy-decision-matrix.md`), so `confirming` is reached exactly as
  a browser action would.
- **The "real state" proof for the confirmation scenario is the mock server's own call
  count, not fixture DOM.** An MCP tool runs on a server process, not in the page — there
  is no DOM element it could flip the way `checkout.html`'s `#purchased` does. The test
  asserts `orderCalls === 0` while the dialog is visible (before Approve) and `=== 1` only
  after — a real, independently-observable side effect on a separate Node process the
  extension cannot fake by merely reporting `Done`, fulfilling the same intent as ADR
  0020's DOM check for the one class of tool call where DOM genuinely doesn't apply.
- **The confirmation dialog's preview text is asserted, not just its presence**: `Call
tool "mcp.shop.place_order"` (from `describeToolCall`, #90) plus a visible `mcp` source
  badge — proving the tool-call-aware confirmation preview built in #90 is what's actually
  on screen, not a generic placeholder.

## Consequences

- Both flows required by #91 now pass in CI: the pre-existing WebMCP spec (#88) and the
  two new MCP scenarios here (`typecheck`/`lint`/`test`/`build` plus the separate e2e job).
- `@aegis/eval-harness` gains its first MCP-adjacent helper without taking on `@aegis/mcp`
  as a dependency — consistent with every existing seeding helper in this package.
- The pattern for "assert a non-browser tool call genuinely didn't run yet" — check a real
  side effect external to the loop itself — is now established for any future MCP/WebMCP
  E2E scenario that needs it: a fixture DOM element when the tool is WebMCP (page-bound),
  or the tool's own real backing state when it's MCP (server-bound).

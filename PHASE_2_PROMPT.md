# Aegis — Phase 2 Build Prompt: Tool-Use (MCP + WebMCP)

> **Run it:** in Claude Code, inside the repo, once Phase 1 (v0.1) is merged:
> _"Read `PHASE_2_PROMPT.md` and execute it fully and autonomously — create the Phase 2 issues, then loop until they're all closed, then tag v0.2."_
> **Resume:** _"Resume `PHASE_2_PROMPT.md`. Read `CLAUDE.md`, `PROGRESS.md`, and the open Phase-2 issues, then continue."_
>
> This builds on v0.1. **All engineering standards and the per-issue execution loop are unchanged** — see `CLAUDE.md` and `BUILD_PROMPT.md` (Sections 5 and 8). This file only adds the Phase 2 design and backlog.

---

## 0. Prerequisites (verify before starting)

- Phase 1 is complete and `main` is green (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`).
- The extension points from v0.1 exist: `ActionRegistry` (packages/actions), the `packages/mcp` stub, the security policy engine + confirmation gate, and the secret vault. If any are missing, stop and report.
- Continue GitHub issue numbering after the last Phase 1 issue; create all Phase 2 issues under new milestones **M8–M12**. Record the backlog#→issue# mapping in `PROGRESS.md`.

---

## 1. Mission

Give the agent the ability to call **declared tools** — from external **MCP servers** and from **WebMCP**-enabled pages — instead of only clicking the DOM. Tools are faster, cheaper, and more reliable than pixel/DOM hunting, and this rides the strongest 2026 trend (structured tool-use). Everything must pass the **same security stack** as browser actions: trust boundary, alignment critic, per-item permissions, and mandatory confirmation for state-changing tools.

**Outcome (v0.2):** the agent can discover and call MCP tools (configured by the user) and WebMCP page tools (auto-detected), prefer them over DOM clicking when they cover the goal, and do so safely and observably.

---

## 2. Design addendum (what's new)

**Unified Tool abstraction.** Introduce a single `Tool` shape that browser actions, MCP tools, and WebMCP tools all implement, so the Navigator chooses uniformly:

```ts
interface Tool {
  id: string; // namespaced, e.g. "browser.click", "mcp.github.create_issue", "web.checkout"
  source: 'browser' | 'mcp' | 'webmcp';
  description: string;
  inputSchema: ZodType; // validated before execution
  risk: 'read' | 'navigate' | 'input' | 'state_changing';
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}
```

The existing `ActionRegistry` is generalized into a `ToolRegistry`; browser actions are registered as `source: "browser"` tools (no behavior change). The Navigator's action schema becomes a tool-call schema.

**Transport reality (important).** A browser extension **cannot spawn stdio processes**, so MCP servers must be reachable over **Streamable HTTP** (the MCP HTTP transport). No stdio transport. Document this clearly; config UI accepts HTTP(S) endpoints + optional auth headers (stored in the vault).

**WebMCP is opportunistic.** WebMCP is an origin-trial feature (2026); it may be absent. Always **feature-detect** page-exposed tools, prefer them when present, and **fall back cleanly** to DOM actions when not. Never hard-depend on it.

**Security is non-negotiable and reused.** Tool calls flow through the same policy engine → alignment critic → confirmation gate. A tool tagged `state_changing` (e.g., "send email", "create issue", "checkout") **always** requires confirmation. Tool descriptions and results are **untrusted content** — sanitize them and never let a tool description inject instructions. Multi-round-trip tools (an MCP tool that asks the user for input mid-call, i.e. elicitation) route through the confirmation/human-input UI. Tool secrets come from the vault and never enter the prompt.

**Dependency rule.** New code lives in `packages/mcp` (client, WebMCP adapter) and extends `packages/actions` (ToolRegistry) + `packages/agent` (tool-calling in the loop). No new cross-cutting cycles.

---

## 3. Issue backlog (create these; numbers continue after Phase 1)

### M8 — Tool abstraction

**P2-1 · Unified `Tool` + `ToolRegistry`** · `type:feature, area:actions, M8`

- Goal: one abstraction for all tool sources.
- Scope: define `Tool`/`ToolContext`/`ToolResult`; generalize `ActionRegistry` → `ToolRegistry`; register all v0.1 browser actions as `source:"browser"` tools with unchanged behavior; keep the risk classification.
- Acceptance: browser actions still pass their tests via the registry; registry supports listing/filtering by source and risk; unit-tested.
- Blocked by: (Phase 1 actions).

**P2-2 · Tool-calling in the agent loop** · `type:feature, area:agent, M8`

- Goal: the Navigator can call any registered tool.
- Scope: replace the Navigator's action schema with a tool-call schema (id + args validated against the tool's `inputSchema`); feed tool results back into memory/verification; unknown-tool and invalid-args handled gracefully.
- Acceptance: Navigator selects and invokes browser + mock tools; verifier consumes tool results; tested with MockProvider.
- Blocked by: P2-1.

**P2-3 · Tool risk gating** · `type:security, area:security, priority:P0, M8`

- Goal: tools obey the security stack.
- Scope: route every tool call through the policy engine + alignment critic; `state_changing` tools require confirmation with a tool-specific preview; sanitize tool descriptions/results as untrusted content.
- Acceptance: a state-changing tool never executes without approval; injected instructions in a tool description are neutralized; tested.
- Blocked by: P2-2, (Phase 1 security core).

### M9 — MCP client

**P2-4 · MCP client (Streamable HTTP)** · `type:feature, area:mcp, M9`

- Goal: connect to MCP servers and call tools.
- Scope: implement an `McpClient` using `@modelcontextprotocol/client` over **Streamable HTTP**; connect/list-tools/call-tool; timeouts, cancellation, typed errors; a `MockMcpServer` for tests. (No stdio transport.)
- Acceptance: client lists and calls tools against MockMcpServer; failures typed; no secrets logged.
- Blocked by: (Phase 1 shared).

**P2-5 · MCP server configuration + storage** · `type:feature, area:mcp, M9`

- Goal: user-managed MCP servers.
- Scope: Zod-validated server config (name, HTTP URL, auth headers → vault, enabled); persisted via storage port; connection test.
- Acceptance: add/edit/remove servers; round-trips storage; auth pulled from vault at call time only.
- Blocked by: P2-4, (Phase 1 vault).

**P2-6 · MCP tools → ToolRegistry** · `type:feature, area:mcp, M9`

- Goal: expose enabled MCP tools to the agent.
- Scope: map MCP tool schemas → `Tool` (namespaced `mcp.<server>.<tool>`); infer/assign risk (default to `state_changing` if unknown, i.e. fail safe); support multi-round-trip/elicitation via the human-input/confirmation UI.
- Acceptance: enabled MCP tools appear to the Navigator; elicitation prompts the user; unknown-risk tools are treated as state-changing; tested.
- Blocked by: P2-5, P2-2, P2-3.

**P2-7 · MCP permissioning** · `type:security, area:security, priority:P0, M9`

- Goal: scope what MCP tools can do.
- Scope: per-server and per-tool allow/deny (deny by default for newly discovered tools); integrate with the policy engine; audit each MCP call in the trace.
- Acceptance: a denied tool is unavailable; newly discovered tools require opt-in; calls appear in the trace; tested.
- Blocked by: P2-6.

### M10 — WebMCP fast-path

**P2-8 · WebMCP detection + adapter** · `type:feature, area:mcp, M10`

- Goal: use tools a page declares.
- Scope: feature-detect page-exposed WebMCP tools from a content script; wrap them as `source:"webmcp"` Tools; clean teardown on navigation; **graceful no-op when absent**.
- Acceptance: detects tools on a WebMCP fixture page; none-present path is a clean fallback; tested.
- Blocked by: P2-1.

**P2-9 · WebMCP preferred-action routing** · `type:feature, area:agent, M10`

- Goal: prefer declared tools over DOM clicking.
- Scope: when a WebMCP tool covers the active sub-goal, the Navigator prefers it; otherwise fall back to DOM actions; record token/step savings in the trace; still fully security-gated.
- Acceptance: on the fixture, the agent completes the goal via the WebMCP tool; falls back correctly when the tool is removed; savings logged; tested.
- Blocked by: P2-8, P2-3.

### M11 — UX & governance

**P2-10 · Tools & MCP management UI** · `type:ui, area:ui, M11`

- Goal: user control over tools/servers.
- Scope: options page to add/enable/permission MCP servers, view discovered tools + schemas, toggle WebMCP usage, per-tool allow/deny.
- Acceptance: changes take effect at runtime; schemas viewable; permissions persist; a11y-checked.
- Blocked by: P2-7, P2-8.

**P2-11 · Trace + confirmation for tool calls** · `type:ui, area:ui, priority:P0, M11`

- Goal: tool calls are observable and gated.
- Scope: render tool calls distinctly in the trace (source, args summary, result); tool-specific confirmation previews for state-changing tools.
- Acceptance: tool calls show in the trace; state-changing tools show a clear preview modal; tested.
- Blocked by: P2-3, (Phase 1 trace/confirmation UI).

### M12 — Integration & release

**P2-12 · E2E: MCP + WebMCP tasks** · `type:test, area:evals, M12`

- Goal: prove tool-use end to end.
- Scope: Playwright runs completing one task via an MCP tool (against MockMcpServer or a local test server) and one via a WebMCP fixture; assert security gating fires for a state-changing tool.
- Acceptance: both flows pass in CI; the state-changing tool requires approval.
- Blocked by: P2-9, P2-11.

**P2-13 · Tool-use evals + security suite** · `type:security, area:evals, priority:P0, M12`

- Goal: measure and harden.
- Scope: add tool-use tasks to the eval harness; extend the security suite with malicious tool descriptions and hostile WebMCP tools attempting exfiltration/unauthorized actions; assert all blocked.
- Acceptance: `pnpm eval` covers tool tasks; every injection attempt is blocked; runs in CI.
- Blocked by: P2-12.

**P2-14 · Docs + v0.2** · `type:docs, area:infra, M12`

- Goal: ship v0.2.
- Scope: document MCP setup (HTTP transport, auth, permissions) and WebMCP behavior; update README/DESIGN; `CHANGELOG`; tag `v0.2.0`.
- Acceptance: a user can add an MCP server and complete a tool task from the docs; tagged.
- Blocked by: P2-13.

---

## 4. Execution & definition of done

Identical to `BUILD_PROMPT.md` §8 (per-issue loop) and §9 (finalization). Reuse `CLAUDE.md` standards verbatim. Quality gates (`typecheck/lint/test/build`, plus `eval` and the security suite) must be green before any issue closes. **Never weaken the security stack** to make a tool work — a tool that can't be gated is not shipped. Phase 2 is done when all P2 issues are closed, `v0.2.0` is tagged, and the agent can safely complete tasks via both MCP and WebMCP tools.

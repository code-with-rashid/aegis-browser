# 0028 — Unified `Tool`/`ToolRegistry` replaces the unused `ActionRegistry` stub

## Context

Issue #80 (Phase 2, M8) asks for one `Tool` abstraction that browser actions, MCP tools
(#83-#86), and WebMCP tools (#87-#88) can all implement, per `PHASE_2_PROMPT.md` §2. v0.1
already shipped a `ActionRegistry` (`registry.ts`) as a designed-but-unwired extension
point — a `type -> {schema, baseRisk}` map with `validate()`/`classify()`. Nothing in
`@aegis/agent` or `apps/extension` actually used it: the real runtime path validates
against the compile-time `ActionSchema` union directly and calls `executeAction` /
`createActionRunner` unchanged. So there was no backwards-compatibility surface to
preserve — `ActionRegistry` could be fully replaced rather than extended alongside a new
type.

## Decision

- `tool.ts` defines `Tool` (`id`, `source: "browser"|"mcp"|"webmcp"`, `description`,
  `inputSchema: ZodType`, `risk`, `execute(args, ctx) => Promise<ToolResult>`),
  `ToolContext`, and `ToolResult` (`Result<unknown, ToolExecutionError>` — never a thrown
  string, matching every other error path in this codebase).
- `ToolContext` is a type alias for the existing `ExecutorContext` (CDP session + tab
  manager) rather than a new shape. `mcp`/`webmcp`-source tools don't need either field —
  they capture their own transport (an `McpClient`, a page binding) via closure at
  registration time — but one call-context type keeps `ToolRegistry.call()` a single,
  uniform signature regardless of source. Widening it later (e.g. adding an optional
  `signal?: AbortSignal`) is a non-breaking interface merge if a future issue needs it.
- `registry.ts`'s `ActionRegistry` is replaced outright by `ToolRegistry`
  (`register`/`unregister`/`get`/`has`/`list({source?, risk?})`/`call(id, args, ctx)`).
  `call()` validates `args` against the tool's `inputSchema` and executes in one step,
  returning `TOOL_UNKNOWN` / `TOOL_INVALID_ARGS` as typed errors for a bad `id` or bad
  args — this is the path #81 (tool-calling in the agent loop) will call directly.
- `validateAction`/`ActionValidationError` (compile-time-typed validation against the full
  built-in `ActionSchema` union — unrelated to the registry, still used for its own sake)
  move to a new `validate-action.ts` for single-responsibility, unchanged in behavior.
- `browser-tools.ts` builds one `Tool` per built-in action, id `browser.<type>` (e.g.
  `"browser.click"`), wrapping `executeAction` unchanged; `risk` is each type's static
  base risk from `risk.ts`'s table. Contextual elevation to `state_changing` (an
  element named "Submit Order") still runs through the existing `classifyActionRisk`/
  `elevateRisk` — a `Tool.risk` is fixed at registration time, but element-name context is
  only known at call time, so elevation stays a separate step layered on top (consumed by
  #82's security gating, not baked into the static field).

## Consequences

- No caller outside this package referenced `ActionRegistry`/`createDefaultActionRegistry`
  (confirmed via repo-wide search), so this is a clean replacement, not an additive
  parallel API — no deprecated/legacy path left behind.
- `createDefaultToolRegistry()` is the new equivalent of `createDefaultActionRegistry()`
  and is what #81 (Navigator tool-calling) and the composition root will construct from.
- Executor-level tests (`executors/*.test.ts`) and the action runner are untouched —
  `executeAction` and `createActionRunner`'s public surface didn't change, so their
  existing tests keep passing unmodified, matching the issue's "unchanged behavior"
  acceptance criterion.

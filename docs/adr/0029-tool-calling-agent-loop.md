# 0029 — Tool-calling in the agent loop

## Context

Issue #81 (Phase 2, M8) asks the Navigator to call _any_ registered `Tool` (#80) — not
just the 14 built-in browser actions — and for the Verifier to consume tool results, with
unknown-tool/invalid-args handled gracefully. The naive approach — rename every
`Action`-typed field in the loop (`DecideOutput`, `PolicyCheckInput`, `CriticCheckInput`,
`ActService`, `ConfirmationRequest`, the trace, `apps/extension`'s confirmation UI) to a
`ToolCall` shape in one pass — would touch nearly every file in `@aegis/agent` plus several
in `apps/extension`, well beyond what #81 alone should own: #82 ("route every tool call
through the policy engine + critic") and #90 ("render tool calls distinctly in the trace,
tool-specific confirmation preview") are separate, later issues _specifically_ scoped to
deepen policy/critic/confirmation/trace's tool-call awareness. Doing that work here too
would step on their scope and multiply this issue's risk for no acceptance-criteria gain —
today, every registered tool is `source: "browser"` anyway (MCP lands in #85, WebMCP in
#87), so a browser-only view is not yet a loss of real capability, only of generality.

## Decision

- **`DecideOutput` carries both `actions` and an optional `toolCalls`.** `actions:
readonly Action[]` is the derived `source: "browser"` view (re-parsed through the real,
  branded schemas) that policy/critic/confirmation/trace keep consuming completely
  unchanged. `toolCalls?: readonly ToolCall[]` is the authoritative decision `acting`
  executes; it's optional specifically so every existing test/mock across
  `machine.test.ts`, `run-manager.test.ts` that constructs a `DecideOutput` by hand (they
  test policy routing, confirmation, guardrails — not tool-calling) needs no changes:
  the machine derives `toolCalls` from `actions` (via `actionToToolCall`) when absent.
  The real `createNavigatorService` always sets both explicitly.
- **`AgentLoopContext` keeps `proposedActions` and adds `proposedToolCalls`, in
  lockstep.** `proposedActions` still feeds `policyCheck`/`aligning`/`confirming`/trace
  exactly as before #81. `proposedToolCalls` is what `acting` invokes. An `EDIT` during
  confirmation updates `proposedActions` as always and now also re-derives
  `proposedToolCalls` via `actionToToolCall`, so a human's edit during confirmation
  actually takes effect at execution time, not just in the preview.
- **`ActService` and `ToolRunOutcome`/`ToolCallRunResult` generalize `@aegis/actions`'
  `RunOutcome`/`ActionRunResult`**, living in `@aegis/agent` (not `@aegis/actions`) since
  they're keyed on `ToolCall`, an agent-loop concept. `createToolCallActService`
  (`loop/act-service.ts`) is the real implementation: a `source: "browser"` call is run
  through the existing, unmodified `ActionRunner` — one call at a time, so its cross-call
  retry/stall/history bookkeeping (`history` persists on the runner instance regardless of
  how many `run()` calls it's split across) is preserved exactly; any other tool call goes
  straight through `ToolRegistry.call()`, with no retry/stall semantics (those were built
  specifically for CDP flakiness, not a generic tool-call concern, and there's no real
  non-browser tool to exercise them against yet).
- **The Navigator's wire schema becomes `toolCalls: {toolId, args: z.unknown()}[]`**,
  replacing the transform-free `LlmActionSchema` mirror (ADR 0006, now superseded and
  deleted) entirely. `resolve-tool-calls.ts` validates each call's `args` against its real
  `Tool.inputSchema` _after_ the model responds — the same "validate for real once
  `generateStructured` succeeds" shape ADR 0006 already used, just against a per-tool
  schema instead of one static union. The prompt (`navigator/prompt.ts`) separately
  describes each available tool's `id`/description/args-schema as text, rendering that
  schema with Zod's `unrepresentable: 'any'` rather than reviving a transform-free mirror
  — a `ref` field losing its "it's a string" JSON-Schema hint is an acceptable loss since
  the existing "Available elements" list already shows the model exactly what a ref looks
  like.
- **`RunSummary` moves from `run-summary.ts` into `services.ts`.** Before #81,
  `services.ts` imported `RunSummary` from `run-summary.ts`, a one-way dependency.
  Generalizing the outcome type to `ToolRunOutcome` (needed by `ActService`'s signature,
  which lives in `services.ts`) while keeping `run-summary.ts`'s `summarizeRunOutcome`
  would have made the two files import from each other. Since `services.ts` is already
  this package's "pure I/O contracts" module, `RunSummary`/`ToolCallOutcomeSummary` moved
  there too; `run-summary.ts` is now just the one summarizing function.

## Consequences

- `@aegis/security`'s policy engine, the alignment critic's prompt, the confirmation gate
  UI, and the trace UI are _not yet_ tool-call-aware — they see the derived,
  browser-only `actions` view. This is accurate today (100% of registered tools are
  `source: "browser"`) and is explicitly #82's and #90's job to close, not a silently
  accepted gap.
- A non-browser tool call (exercised today only by a hand-registered mock `Tool` in
  tests, e.g. `create-navigator-service.test.ts`'s `mcp.weather.lookup`) can be selected
  by the Navigator and executed by `ActService`, but won't appear in a confirmation
  preview or the trace until #90 — also an explicit, temporary limitation, not a security
  gap: #82 gates _policy/critic_ around tool calls before any of this reaches a live MCP
  server.
- `packages/agent`'s only new dependency surface is `ToolRegistry`/`Tool`/`ToolResult`
  (already exported from `@aegis/actions` by #80) — no new cross-package cycles.

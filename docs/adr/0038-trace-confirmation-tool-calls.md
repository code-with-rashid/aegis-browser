# 0038 — Trace + confirmation for tool calls: the confirmation gate becomes tool-call-aware

## Context

Issue #90 (Phase 2, M11) asks for two things: (a) the action trace should render a tool
call's source/id/args/result distinctly, not fold it into one opaque description string;
(b) a `state_changing` tool call should get a real confirmation preview before approval,
whatever its source. The trace's data model (`TraceActionEntry`) already carried
`toolId`/`source`/`argsSummary` since #86/#88 — only the UI (`trace-list.tsx`) never
rendered them as distinct elements. The confirmation side was the real, pre-existing gap
ADR 0033/0036/0037 all explicitly flagged as "#90's job": `ConfirmationRequest`/
`buildConfirmationRequest` were `Action[]`-only, so a `state_changing` MCP/WebMCP tool call
— fully gated by the policy engine and alignment critic since #82 — reached `confirming`
with nothing to show the human. It would execute the instant a batch happened to also
contain a browser action needing confirmation (dragging the ungated tool call along for
the ride), or simply never surface a preview at all for an all-non-browser batch.

## Decision

- **`ConfirmationRequest` gains `toolCalls: readonly PendingToolCallPreview[]`** — every
  pending call, any source, each described as `{toolId, source, description, argsSummary}`
  via `describeToolCall` (already used by the trace and the critic's prompt) +
  `summarizeArgs` (moved from `trace.ts` into `confirmation.ts`, now the one shared
  implementation). This is what the confirmation modal's main (non-editing) view renders.
- **`actions`/`preview` stay exactly as they were** — the `source: "browser"` subset,
  index-aligned, feeding only the `EDIT` flow's per-field text editing. Generalizing Edit
  to revise an arbitrary non-browser tool's args is out of scope: there's no generic
  free-text representation of an arbitrary JSON args object, and #90's acceptance criteria
  only asks for a preview, not editing. The modal disables its Edit button when
  `actions.length === 0` (nothing in the batch is editable) rather than offering an editor
  with nothing to show.
- **`buildConfirmationRequest` takes `toolCalls`, `actions`, `toolRegistry`, `perception`,
  `sanitize?`, `reason?`** — building a tool-call-aware preview needs the registry (to
  resolve each call's `source`) and a sanitizer (a non-browser tool's `description` is
  untrusted, same rule the critic's prompt already follows). `createAgentLoopMachine` now
  takes `toolRegistry`/`sanitize` as constructor dependencies alongside
  `services`/`executorContext` — the same shape `executorContext` already uses (a fixed,
  per-run dependency the pure machine closes over), not a new port on `LoopServices`, since
  the composition root (`run-manager.ts`) already holds `built.toolRegistry` in scope at
  both of its `createAgentLoopMachine` call sites (it already threads the same registry
  through `attachLifecycle` for `buildTraceStep`).
- **The trace UI renders a source badge** (`trace-list.tsx`): a non-browser action gets a
  small `mcp`/`webmcp` badge next to OK/FAILED, and a "Show args" toggle reveals the raw
  `toolId`/`argsSummary` (mirroring the existing "Show raw perception" expand pattern) —
  previously this detail existed only in the underlying `TraceActionEntry` data, never
  rendered.

## Consequences

- A `state_changing` MCP/WebMCP tool call now gets the same real, informative confirmation
  preview a browser action always has — the human sees which server/tool is being called
  and a capped summary of its args before approving, closing the gap #82's policy/critic
  gating had been carrying alone.
- `EDIT` remains a browser-actions-only capability, now explicit rather than implicit: a
  confirmation batch that's entirely non-browser tool calls can be approved or rejected,
  not revised in place.
- `summarizeArgs` has one implementation (`confirmation.ts`), used by both the trace and
  the confirmation preview — previously duplicated across `trace.ts`/would-be
  `confirmation.ts` copies.

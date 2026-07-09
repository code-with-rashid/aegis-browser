# 0014 — Action trace / log UI: where trace data lives, and one array for live + replay

## Context

#26 asks for a live timeline (reasoning, action, target, result per step), expandable
raw perception, and a view that "renders a completed run from history." None of this data
existed anywhere: `AgentLoopContext` only ever kept the _latest_ `lastRunSummary`
(overwritten every cycle) and a bare `subGoalHistory: string[]` — the Planner/Navigator/
Verifier's `reasoning` fields were read once and discarded. Building a genuine trace
needed a decision about what to add to `@aegis/agent`'s core loop versus what belongs in
`apps/extension` (the UI/audit layer, per CLAUDE.md's package layout).

## Decisions

1. **`AgentLoopContext` gains four fields, not a growing list**: `plannerReasoning`,
   `navigatorReasoning`, `verifierReasoning`, `verifyOutcome` — each holding only the
   _most recent_ value, captured in the same `assign()` actions that already run in
   `planning`/`deciding`/`verifying`'s transitions. This is the smallest change that makes
   the data available at all; the machine itself still doesn't know about "trace steps."
2. **`buildTraceStep(context, stepNumber)`** (`packages/agent/src/loop/trace.ts`) is a
   pure function, not a new machine concept: given a snapshot's context, it assembles one
   `TraceStep` by zipping `context.proposedActions` (which has real `Action`s, refs
   included) with `context.lastRunSummary.actions` (which has success/error info) by
   index — both are produced from the same action list in the same run, so zipping by
   index is safe. Each action's `description` reuses `describeAction` (built for #22's
   confirmation preview), so the trace and the human confirmation describe actions
   identically. Returns `undefined` when `lastRunSummary` is unset (nothing to report
   yet, e.g. the very first `planning` pass).
3. **Accumulation, persistence, and broadcast all live in `apps/extension`**, not
   `@aegis/agent`. `background/run-manager.ts` watches the actor's snapshots for the
   `verifying -> (anything else)` transition edge (tracked via a `previousValue` closure
   variable) and calls `buildTraceStep` exactly then, appending to an in-memory
   `trace: TraceStep[]` it owns. This keeps the state machine itself simple (no new
   states/events) and matches the layering: the machine reports what happened, the
   composition root decides what's worth keeping as history.
4. **One accumulated array serves both "live" and "replay" — there's no separate replay
   mode.** `TRACE_SNAPSHOT` (full array, sent on every `registerPort` and reset to `[]` on
   every `START_RUN`) and `TRACE_STEP` (one new entry, broadcast as each completes)
   together keep the Zustand store's `trace` field in sync. Whether a run is still
   growing or has already reached a terminal state, `TraceList` just renders whatever's in
   `trace` — satisfying "renders a completed run from history" without a dedicated
   replay-mode component.
5. **The trace persists to the same `chrome.storage.session` as the loop snapshot** (a
   new `agent-loop-trace` key, validated with `z.array(z.unknown())` — our own
   serialized data round-tripped through our own process, not a real trust boundary, so
   full schema validation is skipped). `RunManager.initialize()` loads it before
   attempting snapshot rehydration, so a resumed run's history survives a service-worker
   restart, not just the still-running state.

## Consequences

- Broadcasting `{type: 'TRACE_SNAPSHOT', steps: trace}` must send a **copy** (`[...trace]`),
  not the live array reference — an early version of this code sent the reference
  directly, and since JS objects are captured by reference, a recipient reading
  `.steps` later would see the array after it had grown, not as it was at broadcast
  time. `run-manager.test.ts`'s reset/mid-run-connect tests catch exactly this class of
  bug.
- `TraceStep`/`TraceActionEntry`/`buildTraceStep` are exported from `@aegis/agent`
  alongside `summarizeLoopRun`, consistent with that being where "interpret loop context
  into UI-facing plain data" already lives.
- The trace UI (`entrypoints/sidepanel/trace-list.tsx`) has no dependency on whether a run
  is active — it's pure `steps => JSX`, made expandable per step (raw perception shown
  via a toggle, not always rendered, keeping the default view scannable).

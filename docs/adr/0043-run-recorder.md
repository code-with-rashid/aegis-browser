# 0043 — Run recorder: capturing a successful agent run as a `Workflow`

## Context

Issue #109 (Phase 3, M13) is the first consumer of #108's `@aegis/workflows` data model:
capture the steps a successful agent run actually executed (tool + args + target
ref/selector + post-condition) into a replayable `Workflow`. `@aegis/agent`'s `AgentLoopContext`
carries everything needed (`proposedToolCalls` for real args, `lastRunSummary` for which
calls actually succeeded, `perception` for resolving a target ref's role/name) — the same
context `apps/extension`'s `run-manager.ts` already reads to build the trace (#26), at the
identical hook point (the `verifying`-exits transition). No selector-deriving mechanism
existed anywhere in the codebase before this issue — perception mints refs from CDP
backend node ids but never persists the `id`/`class` attributes it briefly saw while
building the AX/DOM tree; the recorder has to re-fetch them itself.

## Decisions

- **A pure `buildWorkflowSteps` + a stateful `createRunRecorder`, not one function.**
  `buildWorkflowSteps(input, session, nextStepId)` converts one completed `acting`
  cycle's outcome into `WorkflowStep[]`, mirroring `buildTraceStep`'s exact
  by-index correlation between `lastRunSummary.toolCalls` (outcome) and
  `proposedToolCalls` (real args) — the only alignment guaranteed to hold. `createRunRecorder`
  wraps it, owning a step-id counter across the _whole_ run (a single cycle's local index
  can't produce ids unique across many cycles) and accumulating `steps` for the caller to
  read once the run reaches `done`.
- **Recording stays a pure, testable primitive — actually subscribing to a live XState
  actor is composition-root work, deferred to whichever later issue wires a "Save as
  workflow" UI action.** `PHASE_3_PROMPT.md`'s own dependency rule says "UI stays in the
  app"; `@aegis/workflows` provides `recordCycle`/`steps`, not the subscription itself,
  matching how `@aegis/agent` provides `buildTraceStep` while `run-manager.ts` is what
  actually subscribes and persists.
- **A new `targetRefOf` moved into `@aegis/actions`, replacing a private duplicate in
  `apps/extension/background/policy-service.ts`.** Both the recorder and the policy
  service need "the ref this browser action targets, if any" — the exact same
  switch-over-`Action.type`. Rather than duplicate it a second time in
  `@aegis/workflows`, it now lives once in `@aegis/actions` (which already owns the
  `Action` schema) and both callers import it — a small, low-risk refactor of existing,
  already-tested code, not new behavior.
- **`deriveSelector` is new, `@aegis/workflows`-local CDP surface** (`DOM.describeNode` —
  never called anywhere in this codebase before): `#id` first (most stable), then
  `tag.class1.class2`, falling back to the bare tag name. Deliberately _not_ added to
  `@aegis/perception` or `@aegis/actions` — deriving a _replay-friendly selector string_
  is a workflow-recording concern, not a general perception/action concern, and neither
  existing package has any use for it today. Reuses `@aegis/actions`' `backendNodeIdOfRef`
  rather than re-deriving the ref-parsing regex.
- **`WorkflowTarget.selector` becomes optional**, revising P3-1's original required
  field: `deriveSelector` returns `undefined` outright when a ref doesn't encode a backend
  node id at all, or the element is already detached by record time — real failure modes,
  not edge cases worth inventing a fake selector to paper over. `ref`/`role`/`name` alone
  is still enough for a future self-heal pass (#113) to attempt a semantic re-location.
- **Only `succeeded` tool calls are recorded.** A step that failed during the original run
  isn't something a deterministic replay should blindly repeat; recording only the
  successful path is what makes the resulting `Workflow` a _proven_ sequence, not a replay
  of whatever the Navigator merely attempted.

## Consequences

- `@aegis/workflows` gains its first cross-package dependencies (`@aegis/agent`,
  `@aegis/actions`, `@aegis/perception`) as `PHASE_3_PROMPT.md`'s dependency rule expects —
  still zero consumers in `apps/extension` (that's the next issue to wire in, whenever a
  "record this run" UI action is built).
- `policy-service.ts` loses a few lines of duplicated logic with no behavior change —
  its own test suite (20 tests) still passes unchanged, confirming the extraction was
  behavior-preserving.
- A future schema reader must treat `WorkflowTarget.selector` as optional — already true
  in the Zod schema and this ADR's record of why, so no persisted-data migration is
  needed (P3-1 shipped hours before this issue, with zero real workflows ever persisted).

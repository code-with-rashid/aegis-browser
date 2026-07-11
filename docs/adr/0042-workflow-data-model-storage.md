# 0042 — Workflow data model + storage: a new `@aegis/workflows` package

## Context

Issue #108 (Phase 3, M13) is the first issue of Phase 3: represent and persist a
`Workflow` — a versioned, parameterized, replayable sequence of steps recorded from a
successful agent run (`PHASE_3_PROMPT.md` §2). Nothing records, executes, or heals a
workflow yet (that's #109/#111/#113) — this issue is purely the data model + storage
layer everything else builds on. Per `PHASE_3_PROMPT.md`'s dependency rule, a new
`packages/workflows` depends on `agent`/`actions`/`perception`/`security`/`shared`, never
the reverse — so nothing built here can require a change to any existing package.

## Decisions

- **`WorkflowId`/`WorkflowStepId` are branded locally**, not added to `@aegis/shared`
  alongside `TaskId`/`ElementRef`. Those two are centralized because packages _below_
  `workflows` in the dependency direction (`agent`, `actions`) need to reference them;
  nothing below `workflows` needs to know a workflow or step id exists, so centralizing
  would just be indirection with no consumer on the other end. Both follow the exact same
  `Brand<string, Name>` phantom-type convention, imported from `@aegis/shared`.
- **`WorkflowStep` gets its own stable `stepId`**, which nothing in the `PHASE_3_PROMPT.md`
  sketch's `WorkflowStep` interface actually included. Justified by concrete, already-
  written acceptance criteria in _later_ issues, not speculation: #113's healing "patches
  the workflow" and #119's builder "reorder/delete steps" both need to name one exact step
  independent of its current position in the `steps` array (an array index isn't stable
  across a reorder or an insert). Adding it now avoids a breaking schema change later.
- **A real, generic, but currently-empty migration mechanism** (`migrateToVersion` +
  `Migration` interface + a `WORKFLOW_MIGRATIONS: readonly Migration[] = []` registry).
  `StoragePort`'s own docstring already anticipates "data written by an older schema
  version," but grepping the whole codebase turned up zero existing migration precedent —
  this is a genuinely new concern, not a missed existing pattern. Rather than invent a
  fake "version 0 Workflow" shape to migrate from (there never was one — `WorkflowSchema`
  has only ever had one shape), the mechanism itself is built and unit-tested against
  synthetic fixtures (`migrate.test.ts`), so it's proven correct and ready the day a real
  schema change needs a real migration, without any invented domain logic sitting unused.
- **One storage key holding `Record<WorkflowId, WorkflowEnvelope>`**, mirroring
  `@aegis/mcp`'s `McpServerStore` exactly (a map-of-everything under one key, not a key
  per entity) — appropriate for the same reason: a user is expected to accumulate a
  manageable number of workflows, not enough to need per-id keys and a separate id index
  (`StoragePort` has no "list keys" primitive, so per-id storage would require maintaining
  that index by hand). Revisit toward per-id keys if workflow counts turn out to grow much
  larger than MCP server counts ever have.
- **The persisted envelope separates `schemaVersion` from the workflow's own `version`
  field** — two different, unrelated numbers that happen to share a name-adjacent concept.
  `schemaVersion` (envelope-level) tracks which `WorkflowSchema` _shape_ a document was
  written under, consumed only by the migration step before validation. `Workflow.version`
  (inside the validated document) is the workflow's own revision counter — bumped by
  `updateWorkflow` on every edit, and later by a self-heal patch (#113) — a business fact
  about the workflow, not a fact about the schema.
- **`WorkflowStore`'s API is four explicit verbs** (`createWorkflow`/`getWorkflow`/
  `updateWorkflow`/`removeWorkflow`, plus `listWorkflows`), not one generic upsert —
  directly matching the acceptance criteria's own "create/read/update/version a workflow"
  phrasing as four distinct, separately-testable operations. `createWorkflow` fails on a
  duplicate id (`WORKFLOW_ALREADY_EXISTS`); `updateWorkflow` fails on a missing one
  (`WORKFLOW_NOT_FOUND`) — both real, named error codes on a new `WorkflowError` type
  (mirroring `AgentError`/`StorageError`'s exact shape), distinct from the underlying
  `StorageError` a storage-layer failure produces, since "no such workflow" is a
  domain-level fact, not a storage fault.

## Consequences

- `@aegis/workflows` exists as a real, gated, tested package (21 tests) with zero
  consumers yet — expected and correct for the first issue of a 14-issue phase; #109
  (run recorder) is the first to actually build on `WorkflowStore`.
- The migration mechanism adds real code with no real migrations registered — a
  deliberate, documented trade-off (build the tested mechanism now, invent no fake
  domain migrations), not an oversight; `WORKFLOW_MIGRATIONS`'s doc comment says so
  directly so a future reader doesn't mistake the empty array for unfinished work.
- Every later Phase 3 issue that touches a `Workflow`'s shape (params in #110, execution
  in #111, healing in #113) extends these same schemas rather than introducing a parallel
  representation — the data model is the one place `Workflow`'s shape is defined.

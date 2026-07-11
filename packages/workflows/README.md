# @aegis/workflows

Phase 3: turns a one-off agent run into a reusable, deterministic, self-healing
`Workflow` — record once, replay without the planner, heal when a step breaks, and run
unattended only within a pre-authorized `RunPolicy`. Depends on `@aegis/agent`/
`@aegis/actions`/`@aegis/perception`/`@aegis/shared` — never the other direction, so
those packages stay unaware `@aegis/workflows` exists
(`docs/adr/0042-workflow-data-model-storage.md`).

## The data model (#108)

- `Workflow` — a versioned, parameterized, ordered sequence of `WorkflowStep`s plus a
  `RunPolicy` (what it may do unattended). `version` is the workflow's own revision
  counter, bumped on every `updateWorkflow` call (an edit, or a future self-heal patch).
- `WorkflowStep` — one recorded tool call: `toolId`/`args` (what to call), an optional
  `target` (a captured `ref` plus a resilient `selector`/`role`/`name` for replay and
  self-heal to re-locate the element), and an optional `expect` (a `PostCondition` a
  future step-verification pass checks after executing).
- `WorkflowParam` — a typed, run-time input a workflow exposes: a `value` param (a plain
  default the caller may override) or a `secret` param (never a value, only a
  `secretName` vault reference — resolved at run start, never in a prompt).
- `RunPolicy` — pre-authorized tool ids/origins, whether a `state_changing` step may run
  unattended at all, and optional step/rate caps. Empty allow-lists mean "nothing is
  pre-authorized," never "everything is."

```ts
import { createWorkflowStore, toWorkflowId, toWorkflowStepId } from '@aegis/workflows';
import { createMemoryStorage } from '@aegis/shared';

const store = createWorkflowStore(createMemoryStorage());
const workflow = await store.createWorkflow({
  id: toWorkflowId('check-order-status'),
  name: 'Check order status',
  origin: 'https://shop.example.com',
  steps: [{ stepId: toWorkflowStepId('step-1'), toolId: 'browser.click', args: { ... } }],
  authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false },
});
```

## Storage + schema versioning

`createWorkflowStore(storage: StoragePort)` persists every workflow under one storage
key, keyed by id (`WorkflowEnvelopeMap` — mirrors `@aegis/mcp`'s `McpServerStore`: a
user's workflow count is expected to stay in the "few enough not to need per-id keys"
regime; revisit if that assumption breaks down). Every read runs the persisted envelope
through `migrateToVersion` before validating against the _current_ `WorkflowSchema` —
`WORKFLOW_MIGRATIONS` is empty today (the schema has only ever had one shape), but the
mechanism is real and tested (`src/migration/migrate.test.ts`), not a stub: the day
`WorkflowSchema`'s shape changes, add a `Migration` there and bump
`CURRENT_WORKFLOW_SCHEMA_VERSION`.

`WorkflowStore`'s four operations map directly to the CRUD + versioning P3-1 asks for:
`createWorkflow` (fails on a duplicate id), `getWorkflow`/`listWorkflows` (read),
`updateWorkflow` (patches `name`/`params`/`steps`/`authorization`, bumps `version` and
`updatedAt`, fails if the workflow doesn't exist), `removeWorkflow` (a no-op, not an
error, if already gone).

## Recording a run (#109)

`createRunRecorder(session: CdpSession)` accumulates `WorkflowStep`s across a whole agent
run. A composition-root subscriber (in `apps/extension`, not here — UI/wiring stays in the
app) calls `recorder.recordCycle(snapshot.context)` on the same "`verifying` exits"
transition `apps/extension`'s trace already hooks (`docs/adr/0014-action-trace-log-ui.md`),
then reads `recorder.steps` once the run reaches `done` to build a `Workflow` via
`WorkflowStore.createWorkflow`:

```ts
import { createRunRecorder, createWorkflowStore, toWorkflowId } from '@aegis/workflows';

const recorder = createRunRecorder(cdpSession);
// on every `verifying`-exit transition:
await recorder.recordCycle(snapshot.context);
// once the run reaches `done`:
await store.createWorkflow({
  id: toWorkflowId('check-order-status'),
  name: 'Check order status',
  origin,
  steps: recorder.steps,
  authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false },
});
```

`buildWorkflowSteps` (what `recordCycle` calls internally) mirrors `@aegis/agent`'s own
`buildTraceStep`: it correlates `lastRunSummary.toolCalls` (outcome, no args) with
`proposedToolCalls` (the real args) _by index_ — the same alignment guarantee
`trace.ts` relies on — and only records `succeeded` calls. For a targeted browser action
it also captures the element's `ref`, accessible `role`/`name` (from the _same_
pre-action perception the Navigator itself decided against), and a best-effort resilient
`selector` via `deriveSelector` — a new `DOM.describeNode` CDP call (`#id` first, then
`tag.class1.class2`, falling back to the bare tag) building on the same backend-node-id
`@aegis/actions`' `resolveRef` already decodes from a ref. `selector` is optional on
`WorkflowTarget` (revised from P3-1's original required field,
`docs/adr/0043-run-recorder.md`) since deriving one can genuinely fail outright — a ref
that doesn't encode a backend node id, or an element already detached by record time —
leaving `role`/`name` as the only target information captured for that step.

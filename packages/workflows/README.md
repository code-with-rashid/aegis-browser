# @aegis/workflows

Phase 3: turns a one-off agent run into a reusable, deterministic, self-healing
`Workflow` — record once, replay without the planner, heal when a step breaks, and run
unattended only within a pre-authorized `RunPolicy`. Depends on `@aegis/shared` only for
now (P3-1); later Phase 3 issues add the recorder (`@aegis/agent`), the deterministic
executor (`@aegis/actions`/`@aegis/perception`), and self-heal — never the other
direction, so `agent`/`actions`/`perception`/`security` stay unaware `@aegis/workflows`
exists (`docs/adr/0042-workflow-data-model-storage.md`).

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

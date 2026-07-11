# @aegis/workflows

Phase 3: turns a one-off agent run into a reusable, deterministic, self-healing
`Workflow` — record once, replay without the planner, heal when a step breaks, and run
unattended only within a pre-authorized `RunPolicy`. Depends on `@aegis/agent`/
`@aegis/actions`/`@aegis/perception`/`@aegis/security`/`@aegis/shared` — never the other
direction, so those packages stay unaware `@aegis/workflows` exists
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

## Parameterization (#110)

A freshly recorded workflow has every literal value baked into its steps' `args` — the
exact search term, form value, or password the original run happened to use.
`parameterizeValue`/`parameterizeSecret` extract one such literal into a typed,
overridable `WorkflowParam`, replacing every occurrence across `steps` with a
`‹param:name›` placeholder token (built from code points, not literal characters in
source — the same discipline `@aegis/security`'s `‹secret:name›` already follows):

```ts
import { parameterizeValue, parameterizeSecret } from '@aegis/workflows';

const { steps, param } = parameterizeValue(recordedSteps, {
  name: 'search_term',
  value: 'oat milk', // the literal value as recorded — becomes the param's defaultValue
});

// A literal that was actually a credential, typed directly rather than via a
// ‹secret:name› placeholder already, is parameterized the same way — but the literal is
// used only to find-and-remove it, never stored in the returned param or steps:
const { steps: withSecret, param: secretParam } = parameterizeSecret(steps, {
  name: 'login_password',
  value: 'hunter2',
  secretName: 'my_password', // which vault secret this resolves from at run time
});
```

`validateWorkflowParams(workflow)` checks the two ways params and steps can drift apart:
every placeholder a step actually references has a matching declared param
(`PARAM_NOT_DECLARED` otherwise), and no two params share a name (`PARAM_DUPLICATE`). A
declared param nothing yet references is _not_ an error — a param added ahead of
finishing an edit is a normal, valid intermediate state.

`resolveWorkflowParams(steps, params, values)` produces the final, concrete steps a
deterministic run (#111) actually executes: a `value` param's placeholder becomes
`values[param.name]` (falling back to `param.defaultValue`, or `PARAM_VALUE_MISSING` if
neither exists); a `secret` param's placeholder becomes `‹secret:name›` — **not** a real
value. This function never touches a `SecretVault` at all; the real secret is resolved
later, by the existing `resolveActionSecrets` pipeline immediately before native fill
(`docs/adr/0012-secret-vault.md`) — the same "the workflow layer never sees a real secret
value" guarantee the rest of this codebase already holds for a live agent run
(`docs/adr/0044-workflow-parameterization.md`).

## Deterministic execution (#111)

`runWorkflow(workflow, values, registry, ctx, session, signal?)` binds `values` into
`workflow.steps` (#110) then replays them **with no LLM calls at all** — the whole point
of recording a workflow in the first place. Each step is dispatched straight through
`ToolRegistry.call`, the same generic mechanism the live agent loop's `ActService` uses
for a non-browser tool — reused here for every tool regardless of source, since a
deterministic replay has no use for `ActionRunner`'s retry/stall machinery (tuned for an
LLM-driven loop encountering an unpredictable page; a replay's failure mode is "the page
changed since recording," which retrying can't fix).

```ts
import { runWorkflow } from '@aegis/workflows';

const result = await runWorkflow(
  workflow,
  { search_term: 'almond milk' },
  toolRegistry,
  executorContext,
  cdpSession,
);
if (result.ok && result.value.kind === 'completed') {
  // every step ran, in order, with zero planner/navigator/verifier calls
}
```

Before running each step, `resolveStepTarget` re-targets it for the _current_ page: it
tries the recorded `ref` first (works when replaying within the same page load a step was
recorded against), then falls back to the resilient `selector` (#109) — the mechanism
that actually matters for a genuine "record once, replay later" workflow, since a fresh
page load assigns new backend node ids. Resolving a selector is new CDP surface
(`DOM.getDocument` + `DOM.querySelector` + `DOM.describeNode`) that produces a _new_ ref
for the current session, substituted into the step's `args` via `@aegis/actions`'
`withTargetRef` — the setter symmetric with the `targetRefOf` getter #109 already added.

Neither the recorded `ref` nor the `selector` resolving is a real, expected failure mode
(`TARGET_NOT_FOUND`) — this executor stops the run there rather than trying to recover;
self-healing that (re-locating the element via the LLM, patching the workflow) is #113's
job, not this deterministic path's (`docs/adr/0045-deterministic-workflow-executor.md`).

## Step verification & result capture (#112)

A step's tool call reporting success only proves the browser didn't error — a `click`
that lands on the wrong element still "succeeds." After a successful tool call,
`executeWorkflow` also evaluates the step's `expect` `PostCondition` (if declared) via
`evaluatePostCondition(condition, session)`:

- `element_visible` / `element_hidden` — resolves the condition's `selector` on the
  current page and checks `getComputedStyle`/`getClientRects()`; a selector matching
  nothing is a legitimate `false`/`true` result, not an error.
- `url_matches` — tests a regex `pattern` against `window.location.href`.
- `text_contains` — checks whether `document.body.innerText` contains `text`.

Every `WorkflowStepResult` also now captures `output?: unknown` — the tool call's own
`Result.value` (an `extract` step's read text, an MCP tool's response) — whenever the tool
call itself succeeded, whether or not `expect` subsequently failed it.

Any step failure — target resolution, the tool call itself, or an unmet post-condition —
attaches a typed `NeedsHealingSignal` (`{ stepId, reason, message }`,
`reason: 'target_not_found' | 'tool_call_failed' | 'post_condition_failed'`) to the
`failed` `WorkflowRunOutcome`. This issue only detects and reports it; acting on it (a
repair attempt) is #113's job (`docs/adr/0046-step-verification-result-capture.md`).

## Failure detection & self-heal (#113)

`runWorkflowWithHealing(workflow, values, store, deps, signal?)` is `runWorkflow` (#111)
plus one capability: when a step fails, it asks the Navigator to fix _that step only_
instead of giving up.

```ts
import { runWorkflowWithHealing } from '@aegis/workflows';

const result = await runWorkflowWithHealing(workflow, { search_term: 'oat milk' }, store, {
  registry: toolRegistry,
  ctx: executorContext,
  session: cdpSession,
  navigate: navigatorService, // the same NavigatorService the live agent loop uses
  mode: 'attended', // or 'unattended' — whether a human is present to confirm a heal (#114)
});
```

On a failed step, `healStep` (`heal/heal-step.ts`) gathers a fresh `PerceptionPayload` of
the current page, then calls `deps.navigate` with a `DecideInput` framing the broken step
as a one-step sub-goal ("recover this step; find the current equivalent element or tool
call"). This reuses the live agent loop's whole `NavigatorService` — the same
schema/hallucinated-ref validation and self-correction retry loop a real run already has,
for free. Only the Navigator's _first_ proposed tool call is tried; if the step declared
an `expect` post-condition (#112), the fix must satisfy it too, once it actually runs. Any
failure along this path (no fix proposed, the fix's tool call failed, the fix still
doesn't verify) is `HEAL_FAILED` — `runWorkflowWithHealing` gives up at that point,
returning the _original_ `failed` outcome with the workflow untouched.

A successful, ungated heal patches the fixed step into the persisted `workflow` via the
existing `WorkflowStore.updateWorkflow` — no new patching logic needed, since that already
bumps `version`/`updatedAt` — then continues executing the steps after it. The next run
replays deterministically again with zero LLM calls, until something else breaks
(`docs/adr/0047-failure-detection-self-heal.md`).

## Healing safety & review (#114)

A healed step is LLM-improvised content nobody has reviewed — before #114, it executed
unconditionally, including a `state_changing` action. `healStep` now classifies the
proposed fix's risk and gates it (`heal/heal-gate.ts`) _before_ ever calling the tool:

- **Not state-changing** → `applied` — runs exactly as before.
- **State-changing, attended** → `needs_confirmation` — never executes; carries a
  `HealDiff` (before/after `toolId`/`args`/`target`, plus `risk`) and a `PendingHeal` a
  caller resumes via `applyConfirmedHeal(pending, deps)` once a human signs off.
- **State-changing, unattended** → `hard_stopped` — never executes, no resumption; a
  healed state-changing action must never run silently with no one to confirm it.
- **Tool id outside the workflow's `RunPolicy.allowedToolIds`, unattended** →
  `hard_stopped` regardless of risk — an authorization boundary, not a risk heuristic.

`RunPolicy.allowStateChanging` never overrides this: it pre-authorizes the step as
_recorded_, never a fix the Navigator proposed just now.
`runWorkflowWithHealing`'s outcome widens to `HealingRunOutcome` to carry the two new
gated outcomes (`HardStoppedRunOutcome`/`NeedsConfirmationRunOutcome`) without touching
`executeWorkflow`/`runWorkflow`'s own `WorkflowRunOutcome` (#111), which never produces
them. `rollbackHealedStep(store, workflowId, stepId, previousStep)` reverts one step back
to a prior snapshot — typically a rejected heal's `HealDiff.before` — via the same
`WorkflowStore.updateWorkflow` (`docs/adr/0048-healing-safety-review.md`).

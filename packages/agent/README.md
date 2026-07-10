# @aegis/agent

The orchestration core. Hosts the resumable XState loop machine
(`Planning → Perceiving → Deciding → PolicyCheck → (Aligning → Confirming?) → Acting →
Verifying`), the Planner (decomposition/replanning), the Navigator (next-action
selection), the Verifier (sub-goal success/failure judgment), the alignment critic
(independent second-pass judgment before any state-changing action executes), and loop
guardrails (step/replan budgets, stall-forced replan, stop/pause/resume).

## The loop machine

`createAgentLoopMachine(services, executorContext)` (`loop/machine.ts`) builds the state
chart from `docs/DESIGN.md` §5 — see `docs/adr/0005-agent-loop-machine-design.md` for the
handful of decisions the diagram left open (an extra `Planning -> Done` shortcut, a
`Stopped` terminal state distinct from `Done`/`Failed`, and why persisted context never
holds raw `Error` instances). Call it once per task; `createActor` a fresh instance per
run.

`services: LoopServices` (`loop/services.ts`) is the machine's only way to reach the
outside world — it never imports `@aegis/security` or a concrete planner/navigator
directly, so it stays pure and testable with mocks (`machine.test.ts` drives every
transition — success, retry-via-replan, confirm/reject, stall, stop/pause/resume — through
a mocked `LoopServices`):

- `perceive`/`act` wrap the already-built perception (#10) and action-runner (#14)
  pipelines.
- `plan`/`decide`/`verify`/`checkAlignment` are ports the real Planner (#16), Navigator
  (#17), Verifier (#18), and alignment critic (#23) implement. `checkPolicy` (#22) is the
  same shape, but its real adapter — backed by `@aegis/security`'s policy engine (#21) —
  is composition-root work; see "Confirmation gate" below.

`executorContext: ExecutorContext` (the live `CdpSession` + `TabManager` from
`@aegis/actions`) is closed over by the same factory call, not threaded through machine
context — it's the one thing that's fixed for a run's lifetime but isn't itself a
"service."

Events: `STOP` (from any active state, to `stopped`), `PAUSE`/`RESUME` (around
`perceiving`/`paused`), `APPROVE`/`REJECT`/`EDIT` (from `confirming`).

## Confirmation gate

`PolicyCheckOutput.decision` (`loop/services.ts`) is three-way: `'allow'` proceeds
straight to `actingGate`; `'deny'` (a hard policy block, e.g. a deny-listed origin) routes
to `replanning` — no human can override it from inside the loop, but the task may still be
achievable a different way, bounded as ever by the replan budget; `'confirm'` suspends the
loop in `confirming` and sets `context.pendingConfirmation`. See
`docs/adr/0010-confirmation-gate.md` for the full reasoning, including why this stays a
local, structurally-identical type rather than importing `@aegis/security`'s
`PolicyDecision` (the sibling-package boundary from #20 holds here too — the real
`PolicyService` backed by `@aegis/security`'s policy engine is composition-root work, not
built in `@aegis/agent`).

`buildConfirmationRequest`/`describeAction` (`loop/confirmation.ts`) turn the pending
actions into a `ConfirmationRequest {actions, preview, reason?}` — one human-readable line
per action (e.g. `Click "Submit Order"`), built by matching each action's `ref` against
`context.perception.elements` for its real accessible name. This is what a confirmation
UI (#27) renders instead of raw action JSON.

From `confirming`: `APPROVE` clears `pendingConfirmation` and proceeds to `actingGate`;
`REJECT` clears it and replans; `EDIT {actions}` replaces `proposedActions`, rebuilds the
preview, and stays in `confirming` — a human can revise a proposed action without it ever
executing unsupervised. `loop/controls.ts` exposes all three as `approveLoop`/
`rejectLoop`/`editLoop`.

## The alignment critic

`aligning` sits between `policyCheck`'s `confirm` outcome and `confirming`
(`docs/adr/0011-alignment-critic.md`) — only actions already flagged `confirm` are
checked; `allow` and `deny` never reach it. `createCriticService`
(`critic/create-critic-service.ts`) builds the `CriticService` it invokes: unlike the
Verifier, there's no mechanical heuristic for "does this serve the user's intent," so it
always calls the model (the cheap, low-temperature `critic` role).

`!aligned` routes straight to `replanning` with a `MISALIGNED_ACTION` `lastError` — the
human is never shown a confirmation preview for an action the critic thinks was induced
by the page rather than actually requested. `aligned` proceeds to `confirming` exactly as
before #23, carrying the original policy reason through via `context.policyCheckReason`
(the one new context field the critic's insertion required, since `policyCheck` and
`confirming` are no longer adjacent states). `buildCriticPrompt` (`critic/prompt.ts`)
reuses `describeAction` from the confirmation module so the critic and the human preview
describe the same proposed actions consistently.

## Guardrails & controls

Two budgets keep the loop provably finite (`docs/adr/0008-loop-guardrails.md`):
`maxSteps` (default `DEFAULT_MAX_STEPS = 40`) caps action-execution cycles, checked by
the `actingGate` state before every `acting`; `maxReplans` (default
`DEFAULT_MAX_REPLANS = 8`) caps replans, checked by `replanning` before every `planning`
that isn't the first. Either budget being hit ends the run at `failed` with a
`MAX_STEPS_EXCEEDED`/`MAX_REPLANS_EXCEEDED` `lastError` rather than looping forever. The
stall detector (`@aegis/actions`' `ActionRunner`, #14) is already wired: a `'stalled'`
run outcome routes straight to `replanning`.

Every service (`plan`/`perceive`/`decide`/`checkPolicy`/`act`/`verify`) takes a trailing
`signal?: AbortSignal` — the actor's own signal, which XState aborts the moment its state
is exited. `STOP` was already immediate at the state-machine level since #15 (`on: {
STOP: ... }` fires regardless of what's in flight); this makes it immediate for the
_underlying work_ too — an in-flight `generateStructured` call or action run actually
gets canceled, not left running uselessly in the background.

`loop/controls.ts` gives the (future) UI a small, decoupled API instead of requiring it
to know the raw XState actor shape: `stopLoop`/`pauseLoop`/`resumeLoop`/`approveLoop`/
`rejectLoop`/`editLoop`, each just `actor.send({ type: ... })`. `summarizeLoopRun(snapshot)`
(`loop/summary.ts`) turns any snapshot — mid-run or final — into a plain-data
`LoopRunSummary` (`outcome`, `stepCount`, `replanCount`, `subGoalHistory`,
`taskSummary`/`lastError`/`pendingConfirmation` when set): the "graceful termination +
summary" #19 asks for, usable for a trace UI (#26), a confirmation gate UI (#27), or just
a final report.

## Persistence & resume

Per `docs/DESIGN.md` §4 ("MV3 workers can be evicted, so loop state is persisted... the
XState machine is resumable"), `persistAgentLoopOnTransition(actor, storage)`
(`loop/persistence.ts`) subscribes to an actor and writes `actor.getPersistedSnapshot()`
to any `StoragePort` (from `@aegis/shared` — `chrome.storage.session`-backed in
production, in-memory in tests) after every transition. `hydrateAgentLoopSnapshot(storage)`
reads it back; pass the result straight into `createActor(machine, { snapshot })` to
resume a killed run exactly where it left off (`persistence.test.ts` proves a
persist → kill → rehydrate → resume round-trip, including mid-`confirming` — a run
awaiting user approval when the service worker died still asks for it again correctly on
restart, rather than silently resuming as if approved).

## Trace (for #26's trace UI)

`context.plannerReasoning`/`navigatorReasoning`/`verifierReasoning`/`verifyOutcome`
(`loop/machine.ts`) hold the _most recent_ Planner/Navigator/Verifier reasoning — captured
in the same transition actions that already run, not a new machine concept.
`buildTraceStep(context, stepNumber)` (`loop/trace.ts`) is a pure function turning one
snapshot's context into a `TraceStep`: it zips `context.proposedActions` (real `Action`s,
refs included) with `context.lastRunSummary.toolCalls` (success/error info, by `toolId`)
by index, using `describeAction` (from `loop/confirmation.ts`) for each action's
human-readable description — the same description a confirmation preview would show, or
the raw `toolId` when there's no matching browser action (e.g. a non-browser tool call,
until #90 gives tool calls their own distinct trace rendering). Returns `undefined`
when there's nothing to report yet (`lastRunSummary` unset). See
`docs/adr/0014-action-trace-log-ui.md`: accumulating a list of these into a persisted,
broadcastable trace is composition-root work (`apps/extension/background/run-manager.ts`),
not built here — this package only makes the per-step data available.

## Sanitization (a placeholder for #20)

`identitySanitize`/`wrapUntrustedContent` (`sanitize.ts`) are the shape the real content
trust-tagging/sanitizer (#20) will fill in. `wrapUntrustedContent` labels page-derived
text as an explicit `<untrusted-page-content>` envelope — a real defense usable today —
while `identitySanitize` is a pass-through placeholder for the deeper stripping (hidden
text, zero-width characters, instruction-like imperatives) #20 adds. Callers that build
prompts from perception take a `sanitize: SanitizeText` option so wiring in the real
implementation later touches only the composition root, not `@aegis/agent`.

## The Planner

`createPlannerService(modelRouter, options?)` (`planner/create-planner-service.ts`)
builds the `PlannerService` the loop machine invokes in `planning`. It calls
`generateStructured` (`@aegis/llm`) against the `planner` role's model — resolved via
`ModelRouter`, so it automatically gets the Planner's higher default temperature
(`docs/DESIGN.md` §5: "higher-temp, 'smart' model") — with a schema matching §5's
`AgentBrain` shape, `actions` replaced by `plan` (`planner/schema.ts`).

`buildPlannerPrompt` (`planner/prompt.ts`) turns a `PlanInput` into that prompt: the
task, prior sub-goal history, and — if perceived — the current page's element summary
and readable content, sanitized then wrapped as untrusted data via `sanitize.ts`. The
system prompt (`PLANNER_SYSTEM_PROMPT`) states the untrusted-content rule explicitly, so
a page telling the model to "ignore previous instructions" is just inert text inside the
envelope, never a command.

The LLM's richer output (`observation`/`reasoning`/`memory`/`plan`) is adapted down to
`PlanOutput` (`loop/services.ts`) — `subGoal`/`taskComplete`/`summary` are what the
machine reads; the rest rides along for the trace UI (#26). Any failure (provider
resolution, or `generateStructured` exhausting its retries) becomes a `PLANNER_FAILED`
`AgentError` with the original error as `cause`.

## The Navigator (and tool-calling, #81)

`createNavigatorService(modelRouter, toolRegistry, options?)`
(`navigator/create-navigator-service.ts`) builds the `NavigatorService` the loop machine
invokes in `deciding`. It resolves the `navigator` role's model (low default temperature —
narrow, low-variance choices, not open-ended reasoning) and calls `generateStructured`
with `NavigatorOutputSchema` (`navigator/schema.ts`) — §5's `AgentBrain` shape with
`toolCalls` (not `plan`): a list of `{toolId, args}` pairs, `args` intentionally
`z.unknown()` in this wire schema since it's tool-specific. `toolRegistry.list()` is
re-read on every call (not cached at construction), so a dynamically-changing registry —
a WebMCP tool appearing/disappearing per page, #87 — is always reflected; the prompt
(`navigator/prompt.ts`) lists each available tool's `id`, description, and args JSON
Schema (rendered with `unrepresentable: 'any'`, since a browser tool's schema brands
`ref` via `.transform()`, which JSON Schema can't represent — the separate "Available
elements" list already tells the model what a ref looks like). This supersedes ADR 0006's
transform-free `LlmActionSchema` mirror, which is no longer needed — see
`docs/adr/0029-tool-calling-agent-loop.md`.

`resolveToolCalls` (`navigator/resolve-tool-calls.ts`) validates each raw `{toolId, args}`
against that tool's own `inputSchema`, producing both the authoritative `toolCalls` and a
derived `actions: Action[]` (the `source: "browser"` subset, re-parsed through the real,
branded action schemas) — `actions` is what feeds the policy engine, alignment critic,
confirmation UI, and trace, none of which are tool-call-aware yet (#82, #90 generalize
them). An unknown `toolId` or schema-invalid `args` is collected as an issue rather than
thrown.

`findHallucinatedRefs` (`navigator/hallucinated-refs.ts`) then checks every derived
action's `ref` (where one applies) against `perception.elements`. A schema-valid action
referencing a ref the page never actually had is a hallucination, not a formatting
error — `generateStructured`'s own retry can't catch it. The Navigator gets its own
bounded retry loop on top of both checks: an unresolvable tool call or a hallucination
triggers one corrective re-prompt, and if it still can't self-correct, the decision
resolves as `{ actions: [], toolCalls: [], stuck: true }` — `stuck`, not a hard failure,
so the loop replans instead of aborting the whole task over a model that got confused.

`createToolCallActService(actionRunner, registry)` (`loop/act-service.ts`) is the real
`ActService` the loop invokes in `acting`: every tool call runs through `registry` (any
source), with `source: "browser"` calls additionally routed through the existing
`ActionRunner` one call at a time — its cross-call retry/stall/history behavior
(`@aegis/actions`, #14) is preserved exactly, unchanged. `AgentLoopContext` keeps both
`proposedActions` (feeding the unchanged policy/critic/confirmation/trace path) and
`proposedToolCalls` (what `acting` actually executes) in lockstep — the Navigator sets
both together, and an `EDIT` during confirmation re-derives `proposedToolCalls` from the
edited actions via `actionToToolCall`.

## The Verifier

`createVerifierService(modelRouter, options?)` (`verifier/create-verifier-service.ts`)
builds the `VerifierService` the loop machine invokes in `verifying`, always against
**fresh, post-action perception** — its whole point is preventing the "declared success
but nothing happened" failure class (`docs/DESIGN.md` §5).

It's both a heuristic and a cheap-model check, in order — see
`docs/adr/0007-verifier-outcome-and-replanning.md`:

- **Heuristic first, no model call**: if any action in the run summary didn't
  mechanically succeed (or the run wasn't `'completed'` at all), the sub-goal plainly
  wasn't achieved — `{ outcome: 'failed', taskComplete: false }` immediately.
- **Cheap model, only when every action succeeded**: `generateStructured` against the
  `verifier` role (low default temperature) judges whether the sub-goal's _intent_ was
  actually satisfied, not just whether actions ran without error — a click landing on the
  wrong element still "succeeds" mechanically but achieves nothing.

`outcome` is three-way (`'achieved' | 'continue' | 'failed'`, `loop/services.ts`), not
the two booleans #15 originally shipped — `'failed'` routes to a new
`Verifying -> Replanning` edge (`'continue'` still goes to `Perceiving`, to keep trying
the same sub-goal). `taskComplete` is clamped to `false` whenever the model doesn't also
report `subGoalAchieved: true`, so a confused/contradictory model response can't produce
a nonsensical "task complete but sub-goal not achieved" result.

Depends on `@aegis/actions`, `@aegis/llm`, `@aegis/perception`, `@aegis/shared`.

# @aegis/agent

The orchestration core. Hosts the resumable XState loop machine
(`Planning → Perceiving → Deciding → PolicyCheck → (Confirming?) → Acting → Verifying`),
the Planner (decomposition/replanning), the Navigator (next-action selection), the
Verifier (sub-goal success/failure judgment), and loop guardrails (step/replan budgets,
stall-forced replan, stop/pause/resume).

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
- `plan`/`decide`/`checkPolicy`/`verify` are ports the real Planner (#16), Navigator
  (#17), policy engine (#21), and Verifier (#18) will implement.

`executorContext: ExecutorContext` (the live `CdpSession` + `TabManager` from
`@aegis/actions`) is closed over by the same factory call, not threaded through machine
context — it's the one thing that's fixed for a run's lifetime but isn't itself a
"service."

Events: `STOP` (from any active state, to `stopped`), `PAUSE`/`RESUME` (around
`perceiving`/`paused`), `APPROVE`/`REJECT` (from `confirming`).

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

## The Navigator

`createNavigatorService(modelRouter, options?)` (`navigator/create-navigator-service.ts`)
builds the `NavigatorService` the loop machine invokes in `deciding`. It resolves the
`navigator` role's model (low default temperature — narrow, low-variance choices, not
open-ended reasoning) and calls `generateStructured` with `NavigatorOutputSchema`
(`navigator/schema.ts`) — §5's `AgentBrain` shape with `actions` (not `plan`).

`actions` validates against `LlmActionSchema` (`navigator/llm-action-schema.ts`), a
transform-free mirror of `@aegis/actions`' `ActionSchema` — see
`docs/adr/0006-navigator-llm-action-schema-mirror.md` for why a mirror is needed at all
(Zod's `z.toJSONSchema`, which `generateStructured` uses to build format instructions,
can't represent the `.transform()` that brands `ref` as an `ElementRef`). Once
`generateStructured` succeeds, the raw actions are re-parsed through the real
`ActionSchema` to get properly-branded `Action`s.

`findHallucinatedRefs` (`navigator/hallucinated-refs.ts`) then checks every action's
`ref` (where one applies — `click`/`input_text`/`get_dropdown_options`/
`select_dropdown_option` always; `scroll`/`send_keys` when given) against
`perception.elements`. A schema-valid action referencing a ref the page never actually
had is a hallucination, not a formatting error — `generateStructured`'s own retry can't
catch it. The Navigator gets its own bounded retry loop on top: a hallucination triggers
one corrective re-prompt (telling the model exactly which refs were invalid), and if it
still can't self-correct, the decision resolves as `{ actions: [], stuck: true }` —
`stuck`, not a hard failure, so the loop replans instead of aborting the whole task over
a model that got confused.

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

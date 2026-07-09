# 0005 — Agent loop machine: extra states, service injection, and persistence-safe context

## Context

`docs/DESIGN.md` §5's state diagram is the spec for #15, but three parts needed a
concrete decision beyond what the diagram (and #15's simplified textual scope) spells
out:

1. The diagram only draws `Planning --> Perceiving`. A planner can legitimately
   determine, on its very first call, that there's nothing to do (a purely
   informational request, or a task already satisfied) — forcing a full
   perceive→decide→act→verify cycle just to reach `Done` would be wasteful and add a
   real CDP round-trip with no purpose.
2. "Expose stop/pause/resume" implies **stop** is a distinct, permanent user-initiated
   outcome — but the diagram's `Paused` state only has a `resume` exit, with no separate
   "give up for good" terminal distinct from `Done`/`Failed` (which represent task
   _outcomes_, not user intent).
3. Planner/Navigator/Verifier/Policy (#16, #17, #18, #21) don't exist yet — #15 is
   blocked-by, not blocking, all of them. Whatever the machine calls into for these must
   be a port `@aegis/agent` owns and defines now, not an import of a not-yet-built
   package.
4. The machine's `context` is persisted to `chrome.storage.session` (which serializes via
   `JSON.stringify` under the hood) after every transition. Raw `Error` instances
   (`ActionExecutionError`, `AgentError`) lose their own-but-non-enumerable `message` on
   a JSON round-trip — `JSON.stringify(new Error('x'))` is `'{}'`.

## Decision

1. Added a `Planning --> Done` transition, taken when the planner reports
   `taskComplete: true` on _any_ planning call (not only via `Verifying`).
2. Added a `Stopped` final state, distinct from `Done`/`Failed`. `STOP` is handled from
   every active state and always wins over any other pending transition.
3. `@aegis/agent` defines `PlannerService`/`NavigatorService`/`VerifierService`/
   `PolicyService` as plain async function types (`packages/agent/src/loop/services.ts`)
   — ports the real implementations conform to later. `PerceiveService`/`ActService`
   wrap the already-built `getPerceptionPayload` (#10) and action-runner (#14) the same
   way, so the whole machine is built from injected functions and stays pure/mockable
   (`createAgentLoopMachine(services, executorContext)` is a factory closing over both).
4. Context never stores raw `Error`/class instances. `summarizeRunOutcome` (a pure
   function) flattens a `RunOutcome` into a plain-data `RunSummary` (action type +
   succeeded + `errorCode`/`errorMessage` strings) at the moment `Acting` transitions;
   service failures are stored as `{code, message}` plain objects. `VerifyInput` takes
   `runSummary: RunSummary`, not the raw `RunOutcome`.

## Consequences

- The machine has 3 terminal states (`done`/`failed`/`stopped`) instead of the diagram's
  2 — `docs/DESIGN.md` should be read as the state _flow_, not an exhaustive list of every
  exit.
- Persisted context is plain, JSON-round-trippable data (verified in
  `run-summary.test.ts`), so `chrome.storage.session` persistence never silently drops
  error detail.
- `perceiveActor`'s `PerceptionPayload` can itself carry a `vision.elementBounds` `Map`
  (#11) when `useVision` is used — `Map`s don't survive JSON either. The loop doesn't
  request vision by default, so this is a known, deferred gap, not a regression: whoever
  wires up vision-fallback perception into the loop should convert `elementBounds` to a
  plain array/record before it reaches persisted context.

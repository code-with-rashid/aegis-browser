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

Depends on `@aegis/actions`, `@aegis/llm`, `@aegis/perception`, `@aegis/shared`.

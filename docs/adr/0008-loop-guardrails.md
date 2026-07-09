# 0008 — Loop guardrails: budget gate states and signal-based stop

## Context

#19 needs the loop to be provably finite (a max-step and max-replan budget) and always
stoppable, "within one step," even mid-step. Two implementation questions needed a
concrete answer:

1. XState v5 doesn't have a clean "check a guard, then invoke" pattern for a single
   state — a state's `invoke` starts as part of entering it, before any `always`
   transition on that same state gets a chance to redirect elsewhere. Enforcing a budget
   _before_ the (expensive) `acting`/`planning` work starts needs a separate step.
2. `on: { STOP: 'stopped' }` (already present on every active state since #15) already
   transitions the _state machine_ to `stopped` immediately, regardless of what an
   in-flight `invoke` is doing — XState processes events against the current state
   synchronously. But the underlying service call (a CDP round trip, an LLM request)
   would otherwise keep running to completion in the background, wasting time/cost for
   no reason once the user has asked to stop.

## Decision

1. Added two gate states with only an `always` array (no `invoke`): `actingGate` (before
   `acting`) checks `stepCount >= maxSteps`, and the existing `replanning` state (already
   a pass-through before `planning`) now also checks `replanCount >= maxReplans`. Either
   check failing routes to `failed` with a `MAX_STEPS_EXCEEDED`/`MAX_REPLANS_EXCEEDED`
   `lastError`; otherwise the counter increments and the gate falls through to the real
   work. `policyCheck`'s default transition and `confirming`'s `APPROVE` now target
   `actingGate` instead of `acting` directly.
2. Every service type (`PlannerService`, `NavigatorService`, `PolicyService`,
   `ActService`, `VerifierService`, `PerceiveService`) gained a trailing optional
   `signal?: AbortSignal` parameter. Each `fromPromise` actor in `machine.ts` forwards
   its own `signal` — the `AbortSignal` XState ties to that specific invocation, which it
   aborts automatically when the state is exited (including via `STOP`) — into the
   service call. `createPlannerService`/`createNavigatorService`/`createVerifierService`
   forward it straight into `generateStructured`'s own `signal` option (already
   supported, #5); `ActService`'s real implementation should forward it into
   `ActionRunner.run`'s `options.signal` (already supported, #14).

## Consequences

- The machine's own state transitions on `STOP` were already immediate before this
  issue — the signal threading's value is genuinely stopping the _underlying work_
  (canceling an in-flight LLM call or action run), not the state-transition latency,
  which was never the bottleneck.
- `PerceiveService`'s real implementation (`getPerceptionPayload`, #10) has no abort
  mechanism today, so its `signal` parameter is currently a no-op — kept for shape
  consistency across all six services and so a future perception enhancement can honor
  it without another signature change.
- Default budgets (`DEFAULT_MAX_STEPS = 40`, `DEFAULT_MAX_REPLANS = 8`) are generous
  enough for real multi-step tasks while guaranteeing the loop always terminates even if
  every other guardrail (stall detection, verifier judgment) somehow failed to catch a
  degenerate task.

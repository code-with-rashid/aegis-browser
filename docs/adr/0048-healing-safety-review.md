# 0048: Healing safety & review

## Status

Accepted

## Context

ADR 0047 (issue #113) built the mechanical self-heal loop — propose a fix via the live
agent loop's Navigator, execute it, patch the workflow — and explicitly flagged what it
left out: "no risk classification or confirmation gate sits in front of executing the
proposed fix." That gap is real risk: a healed step is LLM-improvised content that was
never reviewed by the person who recorded the workflow, so an unattended run silently
executing a healed `state_changing` action (a purchase, a delete, a permission grant)
would be exactly the "attack vector" this issue's title warns about. #114 closes that gap
before #113's mechanism is ever wired into a real (background/scheduled) runner.

## Decision

**Gating happens _before_ the fix executes, not after.** `healStep` used to call
`registry.call` immediately once the Navigator proposed a tool call. It now classifies the
proposed tool call's risk and checks it against the workflow's `RunPolicy` and the current
`RunMode` (`attended`/`unattended`) _first_ — `gateHeal` (`heal/heal-gate.ts`) — and only
executes if that check clears. A state-changing fix that would otherwise have silently run
now either pauses for confirmation or hard-stops, never touching the page.

**Risk classification reuses `ToolRegistry.classify` + the same `elementNameFor` pattern
`apps/extension`'s live policy service already uses** (`background/policy-service.ts`) —
resolve the healed tool call's target element's accessible name from the fresh
perception, feed it as `ActionRiskContext.elementName`, let the existing
`STATE_CHANGING_KEYWORDS` elevation (`@aegis/actions`) do the rest. No new risk model was
invented; a healed "Submit Order" button is `state_changing` for exactly the same reason a
live-run "Submit Order" click already would be.

**A heal never gets to lean on `RunPolicy.allowStateChanging` to skip confirmation.** That
flag (per its own doc comment, written in #108's ADR anticipating this issue) pre-
authorizes the step _as recorded_ to run unattended — it says nothing about a step the
Navigator improvised just now. `gateHeal` always requires confirmation for a
state-changing fix when attended, and always hard-stops when unattended, regardless of
`allowStateChanging`. Separately, and unconditionally, a fix whose tool id falls outside a
non-empty `RunPolicy.allowedToolIds` hard-stops when unattended too — an authorization
boundary being exceeded, not a risk heuristic, so it isn't gated by risk level at all.

**Three outcomes, not two.** `HealOutcome` (`heal/heal-step.ts`) is `applied` /
`needs_confirmation` / `hard_stopped`. `needs_confirmation` carries a `PendingHeal` (the
original step + the proposed tool call) a caller resumes via the new `applyConfirmedHeal`
once a human signs off; `hard_stopped` carries only a `reason` — there's nothing to
resume, the run must stop. Both carry a `HealDiff` (`heal/heal-diff.ts`: `before`/`after`
snapshots of `toolId`/`args`/`target`, plus the classified `risk`) — the "show a diff"
half of this issue's scope, decoupled from any particular UI so a future review surface
(#118/#119) can render it however it wants.

**`runWorkflowWithHealing`'s outcome type widens to `HealingRunOutcome`** (`WorkflowRunOutcome
| HardStoppedRunOutcome | NeedsConfirmationRunOutcome`), defined locally in the heal module
rather than added to `execute-workflow.ts`'s `WorkflowRunOutcome` — `executeWorkflow`/
`runWorkflow` (#111) never produce these kinds, only the healing path does; widening the
shared type for a scenario only one caller can hit would leak an irrelevant case into
every other consumer's exhaustive switches.

**`rollbackHealedStep` (`heal/rollback.ts`) is a thin, named wrapper over
`WorkflowStore.updateWorkflow`** — reverting one step back to a prior snapshot (typically
a `HealDiff.before`) is a first-class, independently-callable operation, not something
every caller has to reconstruct (fetch, splice, patch). It still bumps `version`/
`updatedAt` like any other patch: a rollback is a real edit, not a time-machine back to an
exact prior revision.

**No composition-root wiring in this issue.** Nothing yet calls `runWorkflowWithHealing`
with `mode: 'unattended'` for a real background run, nor renders a `HealDiff` in any UI —
that's #115 (background run engine), #116 (scheduler), and #118/#119 (workflow UI). #114
only builds the gate, the diff, and the rollback primitive, each independently tested; the
acceptance criteria ("a heal that would alter a state-changing step is gated; diff shown;
rollback works; unattended heal outside policy hard-stops") are all satisfiable and tested
at this layer without a real UI or scheduler existing yet.

## Consequences

- Every heal attempt now costs one extra risk classification (cheap, synchronous) before
  the tool call — negligible next to the perception pull + Navigator call #113 already
  pays.
- A `needs_confirmation` heal leaves the run stopped mid-workflow with no built-in
  "resume later" persistence — the caller holds `PendingHeal` in memory and must call
  `applyConfirmedHeal` in the same session, or the gated fix is simply lost (matching
  today's reality: nothing yet persists a paused run across restarts). Persisting a
  paused run is presumably #115's concern, not this issue's.
- `HealDiff`'s `before`/`after` are plain data (`toolId`/`args`/`target`/`risk`) with no
  human-readable summary text yet — rendering that nicely is a UI-layer concern for
  #118/#119, not this issue's.

# 0047: Failure detection & self-heal

## Status

Accepted

## Context

#111's deterministic executor stops a run outright the moment a step can't be
retargeted, its tool call fails, or (#112) its post-condition doesn't verify — every
failure carries a typed `NeedsHealingSignal` (`target_not_found` / `tool_call_failed` /
`post_condition_failed`), but nothing acted on it. #113 closes that gap: "recover from
site changes automatically" by invoking the LLM, with a fresh perception of the current
page, to re-locate or re-plan _only the one broken step_, execute the fix, and patch the
persisted workflow so the next run replays deterministically again.

## Decision

**Reuse the live agent loop's `NavigatorService` (`@aegis/agent`) rather than build a
second LLM-calling code path.** `healStep` (`packages/workflows/src/heal/heal-step.ts`)
takes a `NavigatorService` as a dependency and calls it with a `DecideInput` framing the
broken step as a one-step sub-goal ("recover this step; find the current equivalent
element/tool call"). This gets the existing Navigator's whole validation pipeline for
free: `resolveToolCalls` (unknown tool / schema-invalid args), `findHallucinatedRefs` (a
ref not present in the current perception), and its self-correction retry loop — the
exact class of mistake an LLM proposing a fix could make. Building a bespoke
"healing-specific" prompt/validation path would have duplicated all of that for no
benefit.

**Perception is gathered fresh via `getPerceptionPayload` (`@aegis/perception`)**, called
directly from `healStep` against the live `CdpSession` — this package already depends on
`@aegis/perception`, and `getPerceptionPayload` is a pure function of a `CdpSession` (no
composition-root-only wiring), so there's no layering violation in calling it here.

**Only the Navigator's _first_ proposed tool call is tried.** Healing repairs one broken
step; it doesn't hand the Navigator a fresh multi-step plan. If it proposes zero tool
calls or reports `stuck`, that's `HEAL_FAILED` — no fallback prompt, no retry beyond what
`NavigatorService` itself already does internally.

**If the step declared an `expect` post-condition (#112), the fix must satisfy it too**,
re-checked via the existing `evaluatePostCondition` after the fix's tool call succeeds. A
tool call that merely didn't error isn't sufficient evidence the step is actually fixed —
the same standard #112 already holds a normal replay to.

**A new `WorkflowExecutionErrorCode`, `HEAL_FAILED`**, covers every way a heal attempt can
come up empty (no perception, no fix proposed, the fix's tool call failed, the fix still
fails `expect`) — one code, since `runWorkflowWithHealing` treats all of them identically
(give up, leave the workflow untouched).

**`runWorkflowWithHealing` (`heal/run-workflow-with-healing.ts`) is a new, separate entry
point — `runWorkflow` (#111) is untouched.** `runWorkflow` documents itself as "no LLM
calls at all"; silently bolting healing onto it would break that guarantee for every
existing caller. The new function: runs `executeWorkflow` normally, and on a `failed`
outcome, calls `healStep` for the failed step; on success, patches the step into the
workflow via the existing `WorkflowStore.updateWorkflow` (which already bumps `version`/
`updatedAt` — no new patching logic needed), then continues executing the steps after it.
It gives up — returning the _original_ `failed` outcome, workflow left untouched — the
moment a single heal attempt doesn't succeed. No retry of a failed heal, no asking the
Navigator for alternatives, no falling back to re-planning the whole run: a heal that
doesn't work on the first try means the situation needs a human or a re-record, not more
autonomous attempts.

**No risk classification or confirmation gate sits in front of executing the proposed
fix.** This is a deliberate, explicit scope cut, not an oversight: #114 ("Healing safety &
review") is the very next issue, blocked by this one, and its whole job is adding that
guardrail. #113 only proves the mechanical re-locate-and-retry loop works end to end with
a real `MockProvider`-backed Navigator and a mutated fixture (a shifted selector) —
exactly this issue's acceptance criteria.

## Consequences

- A workflow step's `WorkflowStep.target`/`args`/`toolId` can change after a heal — a
  stored `Workflow`'s steps are no longer purely "what was recorded"; they can also
  reflect "what was healed." `version` (bumped by `updateWorkflow`) is the signal that
  something changed since recording.
- Every heal attempt costs one live perception pull plus one Navigator (LLM) call — the
  cost model documented in #111's ADR (a deterministic replay makes zero LLM calls) still
  holds for the common case; healing is the explicit, rare exception.
- Until #114 lands, a self-healed fix executes unconditionally, including a
  `state_changing` action — acceptable because nothing in the current codebase invokes
  `runWorkflowWithHealing` yet (no composition-root wiring exists until #115/#116); this
  ADR exists precisely so that gap is visible and tracked, not silently shipped.

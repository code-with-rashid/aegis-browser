# 0007 — Verifier: three-way outcome, heuristic-first, and a new Replanning edge

## Context

#18 asks the Verifier to "Return achieved/continue/failed" — a three-way outcome — but
#15's original `VerifyOutput` (built before the Verifier existed) only had two booleans,
`subGoalComplete`/`taskComplete`, with no way to distinguish "not yet, keep trying" from
"this approach is a dead end." `docs/DESIGN.md`'s state diagram only draws
`Verifying --> Perceiving | Planning | Done`, with no edge to `Replanning`, so routing a
"failed" outcome needed a decision. Separately, `docs/DESIGN.md` describes the Verifier
as "cheap model or heuristic," posed as alternatives — but a heuristic alone can't judge
whether an action's _intent_ was satisfied (the "declared success but nothing happened"
case is exactly a mechanically-successful action that didn't accomplish anything), while
an LLM call on every verification step is unnecessary cost when the run mechanically
failed and the answer is already obvious.

## Decision

1. `VerifyOutput.outcome: 'achieved' | 'continue' | 'failed'` replaces the two booleans.
   `taskComplete` is retained but only meaningful alongside `outcome: 'achieved'`.
2. Added `Verifying --> Replanning` for `outcome: 'failed'`. `Verifying --> Perceiving`
   now means `'continue'` specifically (actions ran fine, sub-goal not yet visibly met —
   worth trying more actions toward the _same_ sub-goal); `'failed'` means this sub-goal
   attempt hit a dead end and the Planner should choose a different one instead of the
   loop repeating an approach that won't work.
3. `createVerifierService` does both, in order: a heuristic pre-check (any action in
   `runSummary` that didn't mechanically succeed ⇒ `'failed'`, no model call at all) and,
   only when every action succeeded, a `generateStructured` call against the cheap
   `verifier` role asking whether the sub-goal's _intent_ was actually met.
4. `VerifyInput` gained `task: string` (the overall goal) — the original shape only had
   `subGoal`, which made judging `taskComplete` (is the _whole_ task done, not just this
   step) impossible without knowing what the whole task was.

## Consequences

- Verification is free (no LLM call, no latency) whenever the mechanical run already
  answers the question — only the genuinely ambiguous "did this actually work" case
  costs a model call.
- `createVerifierService` clamps `taskComplete` to `false` whenever the model reports
  `subGoalAchieved: false`, even if it also (incoherently) sets `taskComplete: true` —
  the machine only reads `outcome === 'achieved' && taskComplete`, but this guards
  against a confused model producing a nonsensical combination reaching the trace UI.

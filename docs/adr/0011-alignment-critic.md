# 0011 — Alignment critic: placement in the loop, and always-model (no heuristic)

## Context

#23 asks for a second, independent model pass before any state-changing action executes,
per `docs/DESIGN.md` §7.2 and its confirmation-gate sequence diagram: policy check
classifies risk, and for a state-changing action the critic judges alignment _before_ the
human ever sees a confirmation preview — a misaligned verdict blocks the action and
explains why, rather than asking the human to approve something that may have been
induced by the page. The existing `policyCheck -> confirming` transition (#22) needed a
new state inserted between them, and `pendingConfirmation`'s `reason` (previously taken
directly from the policy check's `onDone` event) needed to survive across that extra
state.

## Decision

1. **New `aligning` state, between `policyCheck` and `confirming`.** Only actions the
   policy engine flagged `confirm` reach it — `allow` skips straight to `actingGate` (no
   need to second-guess a read-only action), and `deny` already blocks in `policyCheck`
   itself. `aligning` invokes the new `criticActor`; `!aligned` routes to `replanning`
   with `lastError: {code: 'MISALIGNED_ACTION', message: reasoning}` (mirroring exactly
   how `policyCheck`'s own `deny` outcome is handled, per ADR 0010) — the human is never
   asked to approve it. `aligned` proceeds to `confirming`, building
   `pendingConfirmation` there instead of in `policyCheck`.
2. **`context.policyCheckReason`** carries the policy engine's `reason` string from
   `policyCheck`'s `confirm` transition through `aligning` into the eventual
   `pendingConfirmation`, since the two states are no longer adjacent and XState events
   don't persist across separate invocations — this is the one new context field the
   critic's insertion required.
3. **No heuristic pre-check, unlike the Verifier.** The Verifier's heuristic ("did every
   action mechanically succeed?") is a cheap, purely mechanical fact. Alignment has no
   mechanical analog — judging "does this serve the user's intent" is inherently
   semantic — so `createCriticService` always calls the model (the `critic` role,
   already low-temperature/cheap by default per #6's `DEFAULT_ROLE_TEMPERATURE`).
4. **The critic's prompt reuses `describeAction`** (`loop/confirmation.ts`, built for
   #22's confirmation preview) to describe the proposed actions in plain language, rather
   than duplicating that logic — the critic and the human confirmation preview are
   answering related but distinct questions ("is this what the user meant" vs "here's
   what's about to happen") from the same underlying description.

## Consequences

- A misaligned action and a policy-denied action produce the same shape of outcome
  (silent-to-the-human replan with an explanatory `lastError`) but for different reasons
  — `POLICY_DENIED` is a hard, origin-level rule; `MISALIGNED_ACTION` is a per-action,
  content-aware judgment call that can vary run to run. Both still count against the
  replan budget (#19/ADR 0008), so neither can loop forever.
- `LoopServices` grew a fourth LLM-backed port (`checkAlignment`, alongside
  `plan`/`decide`/`verify`) with a matching `packages/agent/src/critic/` module, following
  the exact same shape (`schema.ts`/`prompt.ts`/`create-critic-service.ts`) as the
  Planner/Navigator/Verifier before it.
- Every mock `LoopServices` fixture in existing tests needed a `checkAlignment` — the
  default test fixture returns `aligned: true`, so pre-existing confirm-path tests
  (approve/reject/edit) keep passing unmodified in behavior, just passing transparently
  through the new `aligning` state on the way to `confirming`.

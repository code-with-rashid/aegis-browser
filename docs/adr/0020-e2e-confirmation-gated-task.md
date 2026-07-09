# 0020 — E2E: confirmation-gated task

## Context

#32 is the safety-path counterpart to #31: a scenario must actually reach the confirmation
gate (`confirming`), pause there, and prove rejecting it never lets the action run. ADR
0019 flagged the blocker while building #31: `background/policy-service.ts` never passed a
third `riskContext` argument to `PolicyEngine.evaluate`, so `classifyActionRisk`'s
`STATE_CHANGING_KEYWORDS` elevation — the only path in this codebase from an ordinary
`input`-risk action to `state_changing` (and therefore to `confirm`) — could never actually
trigger in the real running system. Closing that gap was this issue's first task, since
without it no real scenario could reach `confirming` at all.

## Decisions

1. **`PolicyCheckInput` (`packages/agent/src/loop/services.ts`) gains an optional
   `perception?: PerceptionPayload`.** Optional, not required-with-`undefined`, so the many
   existing tests that construct `{ actions: [...] }` without it stay valid under
   `exactOptionalPropertyTypes` — no test needed to change just because the type grew a
   field.
2. **The `policyCheck` state's invoke input** (`packages/agent/src/loop/machine.ts`) now
   conditionally includes `perception: context.perception` (spread, not assigned directly,
   again for `exactOptionalPropertyTypes`) — the same `context.perception` the `aligning`
   state already received, just newly threaded one state earlier.
3. **`background/policy-service.ts` resolves each action's target element name from
   `input.perception`** (`refOf` + `elementNameFor`) and passes it as
   `ActionRiskContext.elementName` to `engine.evaluate`. This is the actual fix: a `click`
   on a button whose accessible name is "Buy Now" now genuinely elevates to
   `state_changing` risk and requires confirmation, matching what
   `docs/adr/0009-policy-decision-matrix.md` always specified but nothing had wired end to
   end until now.
4. **The E2E scenario is a "Buy Now" click**, not an `input_text` field, since a single
   `click` on a keyword-matching button is the simplest real path from proposed action to
   `state_changing` risk — no need to also design a field name for this scenario.
5. **The Critic is scripted `aligned: true`.** The user's task literally asked to buy this
   item, so alignment genuinely holds — the point of this scenario is testing the human
   confirmation gate, not the alignment critic (#23 already covers that in isolation); an
   `aligned: false` script would route to `replanning` before the human ever sees anything,
   never exercising `confirming` at all.
6. **The test asserts the fixture's own DOM state, not just the loop's reported status** —
   `#purchased` must stay `hidden` both while the dialog is showing (proving the click
   genuinely hasn't run yet, not just that the UI hasn't been told the result) and again
   after Reject drives the run to `done` (proving rejection didn't run it retroactively
   either). This is the literal "unauthorized submit impossible" acceptance criterion, not
   an inference from the loop's own self-reported state.
7. **Reject's replan is asserted via the visible "Replans: 1" counter**, not just "the run
   eventually finished" — proving the specific `confirming -> replanning -> planning` edge
   fired, not merely that _some_ path reached `done`.

## Consequences

- `apps/extension/background/policy-service.test.ts` gained coverage for the new wiring
  directly (a spy `PolicyEngine.evaluate` asserting the exact `riskContext` argument) and
  through the real engine (a "Buy Now" click confirms, the same click renamed "Details"
  doesn't) — the gap ADR 0019 found is now both fixed and regression-tested.
- This is the first scenario needing the alignment critic scripted at all;
  `e2e/scenarios/form-fill-confirmation.ts` is the first `FakeModelResponder` with a
  `You are the Alignment Critic` branch.
- `e2e/confirmation-gated-task.spec.ts` reuses every piece of #31's harness
  (`extension-context.ts`, `seed-storage.ts`, `static-server.ts`, `fake-model-server.ts`)
  unchanged — only a new fixture, a new scenario script, and a new spec file were needed.
- The Approve path (confirm → the click actually running) isn't covered here — #32's scope
  is explicitly the reject/no-submit safety path; an eventual "approve completes the
  purchase" case would be new scope, not a gap in this issue.

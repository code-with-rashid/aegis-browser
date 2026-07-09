# 0026 — Select existing content before `input_text` inserts

## Context

Following up on #73 (ADR 0025), a live diagnostic run of `authenticated-read` (real
`gpt-4o-mini` via OpenRouter) showed a second, independent failure mode. Early in the run
the model briefly typed a literal placeholder-looking string into the access-code field
before correcting itself to the real code `1234`. From that point on the Navigator
proposed the mechanically correct `input_text("1234")` + `click("Enter")` pair every step
— identical to a run that succeeds in one shot — yet the Verifier kept reporting
`subGoalAchieved: false` for 20+ more steps until the eval timed out. A clean run of the
same task (no early mistake) passed in 4 steps against the already-merged #73 fix,
isolating this as a separate bug.

Root cause: `executeInputText` (`packages/actions/src/executors/element-executors.ts`)
called `focusElement` (`.focus()` only) then `Input.insertText` directly. CDP's
`Input.insertText` inserts at the current cursor position / replaces the current
_selection_ — it does not clear existing content on its own, and `.focus()` doesn't
select anything. Once any earlier `input_text` call left stray content in the field,
every subsequent call appended instead of replacing, so the field's value could never
again equal exactly what the model intended to type. `gated.html`'s unlock handler does a
strict `value === '1234'` check; a polluted field (e.g. `<placeholder>1234`) never passes
it, and there's no `clear_field` action to recover with — the loop cannot self-correct.

## Decisions

1. **Added `selectElementContent`** in `resolve-ref.ts`, alongside `focusElement`: selects
   all of a resolved element's existing content via `Runtime.callFunctionOn` — `.select()`
   for native form controls (input/textarea), falling back to a `Range`/`Selection` walk
   for anything else (e.g. a contenteditable element also matched by an interactive ARIA
   role). `Input.insertText` replaces the current selection, so selecting everything first
   makes the action idempotent: the field ends up containing exactly `action.text`
   regardless of what was there before or how many times the action is retried.
2. **Called between `focusElement` and `Input.insertText`** in `executeInputText`, with its
   own `CDP_SEND_FAILED` error path — one more sequential CDP round-trip per `input_text`
   action, accepted for correctness (this executor already does two CDP calls before the
   insert: `resolveRef`'s `DOM.resolveNode` and `focusElement`'s `Runtime.callFunctionOn`).
3. **No new action type.** Considered adding an explicit `clear_field` action the model
   could call separately, but that shifts the burden onto the model remembering to call it
   — and a model that got the field wrong once is exactly the case least likely to
   reliably self-correct with an extra manual step. Making `input_text` itself idempotent
   fixes the failure mode unconditionally.

## Consequences

- `resolve-ref.test.ts` covers `selectElementContent` the same way as `focusElement`
  (dispatches `Runtime.callFunctionOn`, propagates a CDP failure).
- `element-executors.test.ts`'s `executeInputText` suite asserts the call ordering (focus,
  then select, then insert) and that a select-content failure surfaces as its own
  `CDP_SEND_FAILED` error, distinguishable by message from a focus failure.
- Every `input_text` action now costs one additional CDP round-trip; not measured as
  perceptible given the other network/CDP calls already in the same action.
- Found via, and only reproducible through, a live-model run where the model made an
  early, real mistake and then correctly self-corrected — the mock-mode suite's scripted
  responders never produce a wrong `input_text` call, so this accumulation path was never
  exercised.

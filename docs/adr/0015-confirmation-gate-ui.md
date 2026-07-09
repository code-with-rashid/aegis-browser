# 0015 — Confirmation gate UI: native `<dialog>`, Escape-as-Reject, edit scope

## Context

#27 asks for a modal with a specific preview, Approve/Edit/Reject, blocking until
resolved, and keyboard-accessible. Almost all of the underlying data and control flow
already existed from #22 (`ConfirmationRequest`, the `confirming` state, `APPROVE`/
`REJECT`/`EDIT` events, `approveLoop`/`rejectLoop`/`editLoop`) — this issue is mostly
about surfacing what already exists through the messaging bridge and building the actual
UI, plus a few concrete decisions about how "Edit" and "blocks until resolved" behave.

## Decisions

1. **`LoopRunSummary` gains an optional `pendingConfirmation`** (`packages/agent/src/loop/summary.ts`),
   populated whenever `context.pendingConfirmation` is set. This was the one gap in
   already-existing data: `RUN_STATUS` already carries the full summary on every
   transition, so entering `confirming` now surfaces the pending request for free — no
   new background-to-panel message type needed beyond three new panel-to-background ones
   (`APPROVE_RUN`/`REJECT_RUN`/`EDIT_RUN`, which just forward to the existing
   `approveLoop`/`rejectLoop`/`editLoop` control functions in `run-manager.ts`).
2. **The modal is a native `<dialog>` with `showModal()`**, not a custom overlay +
   focus-trap implementation. A real browser's `showModal()` gives inert-background,
   focus-trap, and top-layer rendering for free — exactly what "blocks until resolved"
   and "keyboard-accessible" ask for, with no bespoke a11y code to get wrong.
3. **Escape (the native `cancel` event) is treated as an explicit Reject, not a silent
   dismiss.** `preventDefault()` on `cancel`, then call `onReject()` — the loop is
   suspended in `confirming` until one of the three real decisions arrives; letting
   Escape just close the dialog with no message sent would strand the run there forever.
   Initial focus goes to the Reject button (the safe default), not Approve, so an
   accidental Enter keypress can't approve a state-changing action.
4. **"Edit" only offers a per-action free-text field** (`input_text`'s `text`,
   `send_keys`' `keys`) — not a general action editor (changing an action's type,
   target ref, or adding/removing actions). This matches the realistic use case ADR 0010
   already named ("correct a mistyped field") and the data already available
   (`describeAction`, reused here too, only special-cases those two action shapes).
   Building a full action editor was out of scope for what #27 actually asks.
5. **Save vs. Approve stay two separate steps.** Clicking Edit reveals editable fields;
   "Save changes" sends `EDIT_RUN` (which revises `proposedActions` and stays in
   `confirming`, rebuilding the preview) and returns to view mode — the human must still
   click Approve afterward. This mirrors the underlying state machine exactly (`EDIT`
   never itself unblocks `confirming`) and avoids a "silent auto-approve" trap where
   saving an edit could be mistaken for approving it.
6. **Resetting `draftActions`/`editing` when a new `request` arrives is computed during
   render, not in a `useEffect`.** `eslint-plugin-react-hooks`'s `set-state-in-effect`
   rule flagged the original effect-based version; React's own guidance for "resetting
   state when a prop changes" is to compare against a `previousRequest` state value
   during render and call `setState` there, which avoids an extra commit-then-reset
   render pass. This only matters when the modal _stays mounted_ across an edit (the same
   `pendingConfirmation` slot receiving a new value); a wholly new confirmation later in
   the run is a fresh mount either way.

## Consequences

- jsdom (the test environment) doesn't implement `HTMLDialogElement.showModal()`/
  `.close()` at all, and per the HTML UA stylesheet a `<dialog>` without the `open`
  attribute is `display: none` — invisible to both querying and accessible-name
  computation. The component falls back to setting/removing the `open` attribute
  directly when `showModal`/`close` aren't functions, so tests can see and interact with
  it; a real browser always takes the `showModal()` branch with real modal semantics.
  `confirmation-modal.test.tsx` runs under `// @vitest-environment jsdom` (the rest of
  this package's tests stay on the default `node` environment for speed).
- `@testing-library/react`'s automatic cleanup-between-tests only registers when it
  detects Jest-style global test hooks; since this project doesn't enable vitest's
  `globals` option, `vitest.setup.ts` calls `cleanup()` in an explicit `afterEach` —
  otherwise every rendered dialog from every prior test in a file stays in the DOM,
  breaking `getByRole` queries with "found multiple elements."

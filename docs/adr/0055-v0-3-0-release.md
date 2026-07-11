# 0055 — v0.3.0 release: workflow docs, changelog, version bump

## Context

#121 is the last issue before tagging `v0.3.0`: document recording, parameterization,
self-heal, scheduling, and the RunPolicy/unattended-safety model so a user can, from the
docs alone, record, parameterize, and schedule a workflow; update `CHANGELOG.md`; bump
versions; tag. Mirrors `docs/adr/0041-v0-2-0-release.md`'s process for the same reasons.

Before writing a word of user-facing documentation, auditing what #108–#120 actually shipped
against the acceptance criterion ("a user can record... a workflow") surfaced a real,
blocking gap: **there was no way, anywhere in the shipped UI, to turn a completed agent
run into a `Workflow`.** `createRunRecorder` (#109) was a pure, tested library function
never actually subscribed to a live run; `docs/adr/0043-run-recorder.md` explicitly named
this "deferred to whichever later issue wires a 'Save as workflow' UI action" — and traced
forward through every subsequent Phase 3 issue (#110–#120), none of them turned out to be
that issue. #118/#119's options-page UI only ever _managed_ workflows that already
existed by some other means; the only real way a `Workflow` reached `chrome.storage.local`
was `@aegis/eval-harness`'s `seedWorkflows`, a test/eval-only backdoor, or manual devtools.
Writing a README section describing a "record a workflow" flow that doesn't exist would
have shipped a false claim in v0.3.0's own documentation.

## Decisions

1. **Built the missing "Save as workflow" feature as part of this issue, not just noted
   the gap.** Without any way to create a workflow at all, nothing #118/#119 built is
   reachable by a real user — this is the single most foundational piece of "record,
   parameterize, and schedule a workflow," genuinely blocking the acceptance criterion, not
   an optional nice-to-have deferred docs could paper over. Treated as in-scope necessary
   work for closing Phase 3 honestly, the same judgment call #113/#117/#120 each made when
   their own investigation surfaced a real gap in scope for what they were building.
2. **`background/run-manager.ts` now also owns a `@aegis/workflows` `RunRecorder` per
   run**, fed on the exact same "`verifying` exits" transition edge that already builds the
   trace (#26) — no new subscription mechanism, reusing the one hook this file already had.
   The most recently _completed_ run's recorder and tab are held in two module-scope
   variables (`completedRecorder`/`completedTabId`), reset the moment the _next_ run
   starts — mirroring `trace`'s own existing reset-on-`START_RUN` lifetime exactly, so
   there's no new lifecycle concept to reason about.
3. **A new `SAVE_AS_WORKFLOW` message, not a REST-style call.** Consistent with every
   other panel-to-background action (`START_RUN`, `APPROVE_RUN`, ...) already being a
   fire-and-forget message over the existing `RUN_BRIDGE_PORT_NAME` port; the background
   resolves the tab's current origin fresh (`chrome.tabs.get`) at save time (not captured
   at record time, since the origin is only needed once, at save) and replies
   `WORKFLOW_SAVED`/`SAVE_AS_WORKFLOW_FAILED`. A save is refused (with a reason, no
   partial workflow ever persisted) if no completed run exists yet, the run recorded zero
   steps, or the given name is blank.
4. **The new workflow always gets the fully-open default `RunPolicy`**
   (`allowedToolIds: []`, `allowedOrigins: []`, `allowStateChanging: false`) — the same
   default every other workflow-construction path in this codebase already uses
   (`workflow-heal-seed`'s eval fixture, `apps/eval-harness`'s scenarios). A saved
   workflow with a state-changing recorded step simply can't run unattended until its
   `RunPolicy` is explicitly widened in the builder (#119) — the safe-by-default posture
   `docs/adr/0042-workflow-data-model-storage.md` established from the start.
5. **No inline parameterization at save time.** Turning a recorded literal into an
   overridable param (or a vault-backed secret param) stays the builder's job (#119's
   Params editor) — a save-time picker would duplicate that UI for no real benefit, since
   nothing about _which_ literal is worth parameterizing is time-sensitive. A freshly
   saved workflow starts with zero params, exactly as recorded; a user parameterizes it
   afterward via **Edit**.
6. **`e2e/save-as-workflow.spec.ts` proves the whole loop for real** — completes a
   read-only scenario already used elsewhere (`research-and-extract`, no new fixture
   needed), saves it, and confirms it's visible from the options page's Workflows tab —
   not just that the pieces individually unit-test clean.
7. **Docs mirror ADR 0041's own discipline**: the root `README.md` gains a new
   "Workflows" section grounded in the actual rendered UI text (button labels, tab names),
   not written from memory of the design; `docs/DESIGN.md` gains §17 ("Phase 3 — shipped
   v0.3.0") and strikes through the two now-stale Phase-3 non-goals; `apps/extension/
README.md` backfills one section per issue for #115–#121 (which, like Phase 2's own
   #90–#92, had slipped for the whole milestone); `CHANGELOG.md` gains one `[0.3.0]` entry
   grouped by subsystem, explicitly naming the "Save as workflow" gap as a real fix found
   while writing this issue's docs, not a silent addition; every package bumps from
   `0.2.0` to `0.3.0` (12 `package.json` files: root, `apps/extension`, `evals`, and every
   `packages/*` including the new `packages/workflows`).

## Consequences

- A user really can record (side panel → **Save as workflow**), parameterize and schedule
  (options page → Workflows → **Edit**) a workflow using only what's in the README — the
  acceptance criterion this issue exists to satisfy, now actually true rather than
  aspirational.
- A workflow saved via the side panel starts with no params and the fully-open default
  `RunPolicy` — a user who wants it to run unattended, or wants any part of it
  parameterized, must deliberately visit the builder afterward. This is the safe default,
  not an oversight: nothing saved this way can run unattended at all until a human
  explicitly widens its `RunPolicy`.
- `v0.3.0` is tagged on the exact commit this issue's PR merges to `main`, matching how
  `v0.1.0`/`v0.1.1`/`v0.2.0` were each tagged on their own release PR's merge commit.
- Phase 3 is complete: every P3-1..P3-14 issue (#108–#121) is closed, all four quality
  gates plus `pnpm eval` plus the E2E suite are green, and `docs/DESIGN.md` no longer
  describes anything Phase 3 actually shipped as "not yet built."

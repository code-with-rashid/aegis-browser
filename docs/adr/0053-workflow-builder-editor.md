# 0053: Workflow builder/editor

## Status

Accepted

## Context

#118 gave the options page its first view over a saved workflow: run it, see its history,
and a stopgap inline editor for just its `name` and each `value`-kind param's default.
#119 asks for the real inspect/edit surface: view/reorder/delete recorded steps, add/
remove/edit params (not just tweak an existing default), edit the workflow's `RunPolicy`,
enable/configure scheduling, and show version history.

Auditing `@aegis/workflows` before writing any UI confirmed every capability this issue
needs already exists in the domain layer, built incrementally across #108-#116:
`WorkflowStore.updateWorkflow`'s `WorkflowPatch` already accepts `steps`, `params`, and
`authorization` together in one call; `WorkflowScheduleStore.upsertSchedule` (#116)
already creates-or-replaces a workflow's one schedule. This issue is UI-only, exactly like
#118 — no `@aegis/workflows` changes at all.

## Decision

**`WorkflowLibraryPanel`'s "Edit" now swaps the whole panel for a new
`WorkflowBuilderPanel`, replacing #118's inline per-row edit section entirely** (deleted
`workflow-edit-draft.ts`/`.test.ts`). Steps-reorder, full param CRUD, a `RunPolicy` form,
and a schedule form together are a materially bigger surface than fits in an expandable
`<div>` inside a list row without either bloating `workflow-library-panel.tsx` well past
this codebase's own ~300-line SRP guideline or fighting the list's own per-row layout. A
full-page swap (matching the "no router, plain conditional state" convention `App.tsx`
already established for top-level tabs) keeps each concern in its own small file.

**A step's own `args`/`target`/`expect` stay read-only — only its position and presence in
the list are editable.** A step's content is exactly what was recorded and replayed;
letting this UI rewrite an `args` blob or a `target.selector` would mean editing the exact
contract the deterministic executor (#111) and self-heal (#113) depend on, with no
validation that the result still makes sense. View/reorder/delete matches the issue's own
scope line precisely; a step-content editor is a different, bigger feature not asked for
here.

**`RunPolicy`'s comma-separated lists and numeric fields are edited as raw text
(`RunPolicyDraft`), converted to `RunPolicy` only once, at Save — not on every keystroke.**
An early version round-tripped through `runPolicyFromDraft`/`draftFromRunPolicy` on each
keystroke to keep the displayed value "canonical"; this actively fought typing a list,
since a trimmed, rejoined value would erase an in-progress trailing `", "` before the user
could type the next tool id. `WorkflowRunPolicyEditor` is a purely controlled component
over the draft's own text fields; `WorkflowBuilderPanel` converts to a real `RunPolicy`
only when the user clicks Save, the same "draft state until submit" pattern
`mcp-tools-panel.tsx`'s own add-server form already uses.

**Scheduling saves independently, through its own "Save schedule" button — not folded into
the workflow's own Save.** `WorkflowScheduleStore` is a separate store from `WorkflowStore`
entirely (#116); `upsertSchedule` already create-or-replaces in one call, so
`WorkflowScheduleEditor` is self-contained (loads on mount, edits locally, saves directly)
rather than threading a third draft type through `WorkflowBuilderPanel`'s own save cycle.

**"Version history" is shown at the level the data model actually supports today: `version`
and `updatedAt` in the builder's header, not a snapshot timeline.** `Workflow` has never
persisted prior revisions — `updateWorkflow` overwrites in place, bumping a running
counter. Building a real version-snapshot store (schema, migration, a diff/rollback view
comparable to `HealDiff`/`rollbackHealedStep` from #113/#114, but for human edits) is a
materially bigger feature the issue's scope line doesn't ask for and this ADR deliberately
does not attempt — a future issue's job if a real revision history is wanted.

## Consequences

- Renaming a workflow, editing its params, or changing its `RunPolicy` all bump `version`
  via the same `updateWorkflow` call a self-heal (#113) or a future edit would — there is
  still no way to tell "edited by a human in the builder" apart from "healed by the
  Navigator" from `version`/`updatedAt` alone.
- A param's `kind` can be switched (value ↔ secret) after the fact; switching drops the
  fields unique to the other kind (a `value`'s `defaultValue`, a `secret`'s `secretName`)
  rather than attempting to carry over meaningless data across the switch.
- Deleting or reordering a step never re-validates that the workflow, as a whole, still
  makes sense (e.g. a later step's `expect` referencing state an earlier, now-deleted step
  was supposed to establish) — the executor's own step-by-step verification (#112) is what
  would surface that at the workflow's next run, not this editor.

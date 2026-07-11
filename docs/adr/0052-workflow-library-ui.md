# 0052: Workflow library UI

## Status

Accepted

## Context

Everything through #117 makes a workflow recordable, replayable, healable, schedulable,
and safe to run unattended — but only from code or `gh`/devtools. #118 asks for the first
real UI over `@aegis/workflows`' stores: a place in the options page to see saved
workflows, run one on demand with its own parameter values, view its run history, and edit
its name/param defaults.

Every existing options panel (`mcp-tools-panel.tsx`, `secret-vault-panel.tsx`,
`permissions-panel.tsx`) reads and writes its own storage directly — the options page has
never needed to reach into the background service worker, because nothing it manages has
ever required a live process to act on it. Starting a workflow run is the first thing that
does: `BackgroundRunManager`/`Scheduler` (#115/#116) only exist inside the background
script, and only it can open/attach a tab and drive a CDP session.

## Decision

**A second message-port channel, `WORKFLOW_BRIDGE_PORT_NAME`
(`apps/extension/messaging/workflow-protocol.ts`), separate from the side panel's
`RUN_BRIDGE_PORT_NAME`.** The side panel's channel is scoped to one live agent-loop run at
a time with fire-and-forget messages; the options page can have several workflows'
"Run" actions in flight concurrently, so its messages carry a `requestId` that correlates
a `TRIGGER_WORKFLOW_RUN` request to its `WORKFLOW_RUN_STARTED`/`WORKFLOW_RUN_START_FAILED`
response. `createWorkflowRunTrigger` (`workflow-run-trigger.ts`) wraps that dance so a
panel component just calls `triggerRun(workflowId, values)` and awaits a `Result`. The
background side is a thin listener in `background.ts` that forwards straight to
`scheduler.triggerNow` — no new business logic, since #116 already built the one function
this needed.

**A new sibling component, `WorkflowRunTrace`, rather than reusing the side panel's
`TraceList` (#26).** A live agent-loop's `TraceStep` carries planner/navigator/verifier
reasoning and per-step perception; a deterministic replay's `WorkflowStepResult` is just
`stepId`/`toolId`/`succeeded`/`errorMessage`/`output`, because a replay never calls a
planner at all. Forcing one shared type or component across both would mean either padding
`WorkflowStepResult` with fields a replay can never populate, or teaching `TraceList` to
render two unrelated shapes — a new component with the same Show/Hide progressive-
disclosure convention was the smaller, clearer surface.

**Editing a workflow is scoped to its `name` and each `value`-kind param's `defaultValue`
only — never its recorded `steps`.** A `steps` editor (reorder, retarget, delete a step) is
a materially bigger, separate piece of surface — #119's own job ("Workflow builder/
editor"). A `secret`-kind param has no editable value here at all; it only ever carries a
`secretName` vault reference, never a value, so there is nothing for this panel to show or
change for one beyond leaving it untouched in the patch.

**No confirmation dialog on "Delete."** `mcp-tools-panel.tsx`'s own "Remove" button already
established the precedent of no confirmation step for removing a configured resource in
this options page; a workflow being one recorded run away from re-creation made a second,
inconsistent convention (a confirm dialog only here) not worth introducing.

## Consequences

- The options page now depends on `chrome.runtime.connect` for the first time — previously
  every panel worked from storage alone and needed no live background process at all.
  `WorkflowLibraryPanel`'s "Run" action is the one thing in the entire options page that
  does not work if the background service worker is, for whatever reason, unable to
  respond (the request simply never resolves; there is no timeout on
  `createWorkflowRunTrigger` today).
- A `value`-kind param with no default and left blank at run time is passed through as an
  empty string — the existing `resolveWorkflowParams` (#110) is what actually surfaces a
  `PARAM_VALUE_MISSING` error back through `WORKFLOW_RUN_START_FAILED` if that's not
  acceptable for a given param, so the panel itself does no client-side "required" checking.
- Renaming a workflow or changing a param default bumps its `version` via
  `WorkflowStore.updateWorkflow` (#108) exactly like a heal would — the library UI has no
  way today to distinguish "edited by a human in this panel" from "healed by the Navigator"
  in a workflow's own history, only in whichever surface a caller chooses to show it.

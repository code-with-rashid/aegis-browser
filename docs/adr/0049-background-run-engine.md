# 0049: Background run engine

## Status

Accepted

## Context

Every workflow-execution capability built so far (#111-114) assumes something is
actively waiting on the result — a caller `await`s `runWorkflow`/`runWorkflowWithHealing`
in one call, on the tab already open in the side panel. #115 asks for something
structurally different: run a workflow **unattended**, with no side panel open and not on
the user's active tab, in a Manifest V3 service worker that Chrome can evict and restart
at any time. That constraint (`docs/DESIGN.md` §4, restated in `PHASE_3_PROMPT.md` §2:
_"Service workers are evicted; use `chrome.alarms` for scheduling and a managed/offscreen
tab to actually drive a page... Persist run state so an evicted worker resumes"_) shapes
every decision below.

## Decision

**A managed tab is a real, non-active `chrome.tabs` tab — not a `chrome.offscreen`
document.** `chrome.offscreen.createDocument()` creates an extension-owned page for
capabilities like clipboard/audio access; it cannot navigate to an arbitrary third-party
origin, and `chrome.debugger` cannot attach to it as a normal web page. Driving a real
recorded workflow against a real site requires a real tab. `chrome.debugger.attach` works
against any tab regardless of focus, so `apps/extension/background/managed-tab.ts`'s
`openManagedTab` is just `chrome.tabs.create({ url, active: false })` — the simplest thing
that is actually a "managed/offscreen tab" in the sense the phrase was used for.

**Resumability is checkpointed per-step, in the pure domain package, not the composition
root.** `packages/workflows/src/background/run-workflow-in-background.ts`'s
`runWorkflowInBackground` doesn't reuse `runWorkflowWithHealing`'s (#113/#114) all-at-once
loop — it drives `executeWorkflow`/`healStep` **one step at a time**
(`executeWorkflow([step], ...)`), persisting `WorkflowRunRecord.stepResults`/
`nextStepIndex` via `WorkflowRunStore.updateRun` after every single step. If the service
worker is evicted between two steps, the last persisted checkpoint is the truth — a
second call with the reloaded record resumes from exactly `nextStepIndex`, never
re-running a completed step and never silently skipping one that wasn't. This is testable
entirely in-package (`run-workflow-in-background.test.ts` simulates an interruption via
an already-aborted signal, then constructs a _fresh_ `WorkflowRunStore` instance over the
same storage and resumes) — no real browser or service worker needed to prove the
guarantee holds.

**Always heals with `mode: 'unattended'` (#114).** There is no one to confirm a
state-changing fix in a background run; `gateHeal` already hard-stops in that case. The
engine's `switch` over `HealOutcome` still handles `needs_confirmation` defensively (it
maps to a `WorkflowRunRecord` with `status: 'needs_confirmation'`) purely to stay
exhaustive against the type — `gateHeal` never actually produces it for this mode today.

**`WorkflowRunRecord` gains a `tabId` field**, set by the composition root once a tab is
opened/reattached — the pure engine itself never opens a tab, it just executes against
whatever `CdpSession` it's handed. On `initialize()` (service-worker startup), the
composition root reattaches to the **recorded** `tabId` rather than opening a fresh one:
the browser tab itself survives a service-worker eviction (only the worker's in-memory
JS state is lost), so the run should keep using the same page rather than starting over
on a blank one.

**`createBackgroundRunManager` (`apps/extension/background/background-run-manager.ts`)
reuses `buildLoopServices` completely unchanged.** It already assembles everything a
background run needs for a given `tabId` — a live `CdpSession`, a `ToolRegistry` with
MCP/WebMCP registered, and (critically) `services.decide`, which **is** a real
`NavigatorService` (`createNavigatorService(modelRouter, toolRegistry, ...)`) — exactly
what `runWorkflowInBackground`'s `deps.navigate` needs for a heal. No second
composition-root path was built; the only new code is opening/closing the tab and driving
`runWorkflowInBackground` instead of the live XState agent loop.

**Concurrency limiting is a plain in-memory counter (`run-concurrency.ts`), not
persisted.** A service-worker restart means nothing is actually still running in memory —
the limiter simply starts fresh at zero every time the worker starts, same as it would if
nothing had been running at all. `createBackgroundRunManager` takes `maxConcurrentRuns` as
a plain constructor argument (hardcoded to `1` in `entrypoints/background.ts` — no UI
configures it yet; that's #116/#117 territory).

**No new messaging protocol.** `BackgroundRunManager.startBackgroundRun` is a plain async
function, not a `PanelToBackgroundMessage` — it doesn't depend on a side panel connecting
at all, which is exactly what "no side panel open" requires. #116 (Scheduler + triggers)
is the issue that will actually call it (from a `chrome.alarms` handler or a manual
trigger); #115 only proves the engine and its lifecycle work end to end.

## Consequences

- A `WorkflowRunRecord` left `running` with no `tabId` (shouldn't happen in practice,
  since the composition root always sets it right after opening/reattaching) is treated as
  unrecoverable and marked `failed` on `initialize()` rather than silently retried forever.
- If a managed tab is closed out from under a run (the user closes it, or the browser
  fully quits and the tab doesn't come back), `initialize()`'s reattach will fail; today
  that surfaces as a `failed` run record via `buildLoop`'s own attach-failure path — a
  fresh managed tab is not automatically re-opened to retry. Revisit if #116/#117 need
  that resilience.
- `runWorkflowInBackground` costs one extra `WorkflowRunStore.updateRun` storage write per
  step compared to `runWorkflowWithHealing`'s single end-of-run write — acceptable given
  the whole point is surviving a mid-run interruption.

# 0054: Workflow evals + security suite

## Status

Accepted

## Context

Everything through #119 makes a workflow recordable, replayable, self-healing, editable,
and schedulable — but nothing yet _measures_ whether self-heal actually earns its keep, or
_proves_ the unattended-run safety invariants hold end-to-end rather than just at the
unit-test level. #120 asks for both: an eval proving deterministic replay and self-heal
across a simulated site change (measuring heal success and planner-call reduction), and a
security suite proving unattended runs never make an unauthorized state change and are
never hijackable via injected page content.

Auditing the existing infra first (`evals/`, `@aegis/eval-harness`, and #113/#114/#117's
own unit tests) found: every domain capability #120 needs already exists
(`WorkflowStore`/`WorkflowRunStore`/background run engine/`gateHeal`/`gateOriginalStep`);
`packages/workflows`' own heal/guardrail tests use a unit-level fake `CdpSession` (no real
browser); and `evals/`'s existing `EvalTask`/`runTask` machinery is tightly built around
"fill the side panel, click Start, poll rendered text for Done/Failed/Stopped" — a shape
that doesn't fit a _background_ workflow run at all, since a real scheduled run has no
side panel, and the options page's own "History" view is on-demand, not a live dashboard.

## Decision

**A new, parallel eval path (`evals/src/workflow-runner.ts`/`workflow-scorer.ts`/
`workflow-report.ts`), not a shoehorned `EvalTask` entry.** Rather than stretching
`EvalTask`'s side-panel-driving shape to fit a background run, `runWorkflowHealEval` drives
the real, built extension exactly the way a real background run actually happens: trigger
via the options page's real "Run" button (#118/#119), then **observe the outcome by
polling `chrome.storage.local` directly** (`waitForWorkflowRuns`, new in
`@aegis/eval-harness`) rather than any rendered UI — a background/scheduled run has no UI
open at all in production, so reading the same storage it would leave behind is the more
faithful signal than parsing a click-to-refresh History view. `pnpm eval`'s CLI runs both
the existing `TASK_SET` and this new workflow eval, reporting both and failing on either.

**Heal success + "planner-call reduction" become a scored pass/fail, not just a printed
number.** Two fixtures reuse the exact identical recorded workflow (one step: click "Check
availability"), the only difference their `origin` URL: `workflow-heal-v1.html` (unchanged
— the button `#check-status` still exists) and `workflow-heal-v2.html` (the same button,
same accessible role/name, but a different id — "the site changed since it was recorded").
A wrapped, call-counting `FakeModelResponder` measures exactly how many model calls each
replay took. The eval passes only if: the clean replay completes with **zero** model calls
(a deterministic replay never plans at all, #111), and the healed replay both completes
and needed a small, bounded number of calls (1-2 — a targeted Navigator-only fix, never a
full multi-step re-plan) — turning "measure heal success + planner-call reduction" into an
assertion, with the absolute numbers printed alongside the existing `TASK_SET`'s own
step/replan counts so a reader can directly compare a workflow's near-zero cost against a
live loop's typical several-calls-per-step cost in the same report.

**The two phases run sequentially against one extension instance**, not two separate
eval-task entries run independently: the background run engine caps concurrent runs at 1
(`background.ts`'s `MAX_CONCURRENT_BACKGROUND_RUNS`), so triggering both before the first
finishes would just queue the second behind it — sequential is simply how it would behave
regardless, and reusing one extension instance halves the launch overhead.

**The security suite is a new Playwright E2E spec
(`apps/extension/e2e/workflow-unattended-security.spec.ts`), not a `packages/workflows`
vitest test** — matching this codebase's existing convention (ADR 0022/0040:
`security-injection.spec.ts`/`hostile-tool-security.spec.ts`) of proving a security
invariant against the _real_ composed system, not a fake. This distinction actually
matters here: `packages/workflows`' own heal tests inject a bare mock `NavigatorService`
function, which can't prove anything about prompt sanitization (that's `@aegis/agent`'s
`createNavigatorService` implementation, only ever wired in for real by
`buildLoopServices`) — only a real extension exercising the real background run engine
(`createBackgroundRunManager`'s `drive()`, unchanged since #115/#116/#117, always calling
the real `buildLoopServices`) can prove anything about what a hostile page actually causes
to happen.

**Writing the first test surfaced a real, pre-existing gap, deliberately not fixed here:**
`buildNavigatorPrompt` (`packages/agent/src/navigator/prompt.ts`) sanitizes
`perception.content.text` (the free-text "Page content:" section) and a tool's own
`description` (via `formatTool`), but never an individual page element's accessible
`name` — ordinary visible page text becomes an element's name via the accessibility tree,
so injected text placed there (as opposed to a hidden node, which never reaches
`content.text` at all in the first place — accessibility trees exclude `display:none`
content) reaches the Navigator's prompt completely raw, for the live loop as much as for a
workflow heal, since both share the exact same prompt builder. This is a `packages/agent`
concern spanning the whole product, not something specific to "workflows" — fixing it is
out of scope for this issue and is noted here for a future issue to pick up. What this
suite actually asserts instead — matching `hostile-tool-description.ts`'s own established
"survives sanitization by design" precedent — is that the **structural** safety net holds
regardless: `gateHeal` never lets an unattended heal auto-apply a state-changing action, so
the induced "Delete Account" click never runs, whether or not the model saw the bait
verbatim.

**A second, complementary test proves the allow-list gate end-to-end**, not just at the
unit level (`run-policy-gate.test.ts`/#117's own tests already prove this as a pure
function): a workflow whose one step's tool id isn't in `RunPolicy.allowedToolIds`,
pointed at the _unmodified_ fixture where the button genuinely exists and would have
worked — proving the real background run engine hard-stops before ever attempting the
step, verified by the fixture's own DOM state staying untouched, a genuine external
signal rather than the run's self-reported status alone.

## Consequences

- `pnpm eval` now takes a few seconds longer (two more real, headed-browser runs) — judged
  worth it, since it's the only mechanism that can genuinely measure the "reusable,
  deterministic automations" value proposition (`docs/DESIGN.md`'s own framing of Phase 3)
  rather than asserting it in prose.
- The workflow eval is mock-mode only, unconditionally — its pass criteria are exact model-
  call counts against a scripted responder, meaningless against a real, nondeterministic
  provider (the same reason live mode is already a manual, local-only invocation never
  wired into CI, ADR 0021).
- The discovered element-name sanitization gap remains open. It does not weaken any
  invariant this issue is responsible for (the structural gates it depends on — `gateHeal`,
  `gateOriginalStep`, the alignment critic — never depended on sanitization catching every
  injection vector in the first place, per ADR 0022's own founding principle), but it is a
  real gap in defense-in-depth worth a future issue.

# @aegis/evals

The reliability eval harness (#33): runs a versioned task set against the real built
extension and emits a scored report — "make reliability a number," not a vibe.

```bash
pnpm build                          # from apps/extension, or via turbo's ^build dependency
pnpm --filter @aegis/evals eval     # mock mode — deterministic, no API key needed
```

## Modes

- **mock** (default): every task runs against the same local fake-model server
  `apps/extension`'s Playwright E2E specs use (`@aegis/eval-harness`) — deterministic,
  fast, no credentials. This is the regression check safe to run in CI.
- **live**: runs the same task set against a real, caller-configured provider —
  ```bash
  pnpm --filter @aegis/evals eval -- --mode=live --provider-kind=openai --model=gpt-4o-mini --api-key=sk-...
  ```
  `--provider-kind` is one of `openai` / `anthropic` / `google` (each need `--api-key`),
  `ollama` (optional `--base-url`), or `openai-compatible` (needs `--base-url`, optional
  `--api-key`). No credential is ever read from anywhere but the explicit `--api-key`
  flag — live mode is a deliberate, manual, local-only invocation, never wired into CI.

## The task set

`src/task-set.ts`'s `TASK_SET` is the versioned set `pnpm eval` runs — the three read-only
scenarios `apps/extension/e2e/read-only-use-cases.spec.ts` proves in CI
(`research-and-extract`, `compare-and-summarize`, `authenticated-read`) plus two tool-use
tasks (#92): `webmcp-shipping` (a WebMCP fixture tool, no extra infra needed — the page
declares the tool itself) and `mcp-tool-task` (a real MCP tool, via a `setup` hook that
starts a `MockMcpServer` and seeds it into storage before the run, and tears it down
after). All five are imported directly from `@aegis/eval-harness` so the E2E suite and
this reliability harness can never silently drift apart on what a scenario is supposed to
do.

### Adding a task

1. Add a fixture HTML page under `packages/eval-harness/src/fixtures/`.
2. Add a scenario module under `packages/eval-harness/src/scenarios/` exporting: a task
   string, a fixture filename constant, an expected-summary substring, and a
   `createXyzResponder(): FakeModelResponder` — see any existing scenario for the shape
   (a `switch`-like set of `if (systemPrompt.includes('You are the Planner'))` branches
   returning scripted JSON per role/call-index; use `findRef(userPrompt, name)` rather
   than hardcoding an element ref, since refs are assigned by the real perception
   aggregator at runtime).
3. Export the new constants from `packages/eval-harness/src/index.ts`.
4. Add an entry to `TASK_SET` in `src/task-set.ts` and bump `TASK_SET_VERSION`. If the
   task needs live infra beyond the fake model/static servers `runTask` always starts
   (e.g. a real MCP server), give it a `setup(worker)` that returns a teardown — see
   `mcp-tool-task`'s entry.
5. Optionally also add it to `apps/extension/e2e/read-only-use-cases.spec.ts`'s
   `SCENARIOS` array if it should also be a CI correctness check, not just a reliability
   measurement.

## Scoring

A task passes only if it reaches `done` **and** its final state contains the expected
summary substring — reaching a terminal state for the wrong reason, or the right one
without the right content, still fails (`src/scorer.ts`). `src/runner.ts` drives the
actual browser (via `@aegis/eval-harness`) and polls the side panel's own rendered text
for a terminal status word rather than reaching into any internal state — the same
signal a human watching the side panel would see.

## The workflow self-heal eval (#120)

A separate, parallel eval path (`src/workflow-runner.ts`/`workflow-scorer.ts`/
`workflow-report.ts`), always run in mock mode, printed after `TASK_SET`'s own report:
proves deterministic replay and self-heal across a simulated site change, and measures
the "planner-call reduction" a compiled workflow gets over a live re-plan. It seeds two
copies of the same recorded one-step workflow directly into `chrome.storage.local`
(`@aegis/eval-harness`'s `seedWorkflows`) — one pointed at the exact page it was recorded
on, one pointed at a page where the same button's id changed (its accessible role/name
didn't) — triggers each via the real options page's "Run" action, and observes the
outcome by polling `chrome.storage.local`'s `workflow-runs` key directly
(`waitForWorkflowRuns`) rather than any rendered UI, since a background run has no UI open
in production. It passes only if the clean replay completes with **zero** model calls and
the healed replay completes with a small, bounded number (1-2) — see ADR 0054.

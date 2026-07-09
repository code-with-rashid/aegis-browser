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

`src/task-set.ts`'s `TASK_SET` is the versioned set `pnpm eval` runs — currently the same
three read-only scenarios `apps/extension/e2e/read-only-use-cases.spec.ts` proves in CI
(`research-and-extract`, `compare-and-summarize`, `authenticated-read`), imported directly
from `@aegis/eval-harness` so the E2E suite and this reliability harness can never
silently drift apart on what a scenario is supposed to do.

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
4. Add an entry to `TASK_SET` in `src/task-set.ts` and bump `TASK_SET_VERSION`.
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

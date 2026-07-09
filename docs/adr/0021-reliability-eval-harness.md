# 0021 — Reliability eval harness

## Context

#33 asks for a versioned task set, a runner with mock + live modes, scoring + a report,
and a regression check usable in CI — "make reliability a number." The task set is meant
to be "seeded from the use cases," i.e. #31's read-only E2E scenarios. Reusing those
scenarios verbatim (rather than re-authoring a second copy) meant first deciding where the
reusable pieces should live.

## Decisions

1. **Extracted a new shared package, `packages/eval-harness`**, holding everything #31's
   E2E specs built that has nothing to do with Playwright's test-runner API itself:
   `launchExtension`, `startFakeModelServer`, `startStaticServer`,
   `seedModelRoutingConfig`, `findRef`, and all four scenario scripts + fixture HTML
   pages (`research-and-extract`, `compare-and-summarize`, `authenticated-read`,
   `form-fill-confirmation`). `apps/extension/e2e/*.spec.ts` now import these instead of
   maintaining local copies — the same scenario that proves correctness in CI now also
   drives this reliability harness, with no way for the two to silently drift apart on
   what a scenario is supposed to do.
2. **`eval-harness` depends on `playwright` (the core library), not `@playwright/test`.**
   `evals/`'s CLI runner is a plain Node script, not a Playwright test file — pulling in
   the test-runner package there would be the wrong dependency for what's actually a
   programmatic browser-launch need. `launchExtension`/`startStaticServer` were
   parameterized (`extensionPath`, `fixturesDir` arguments) since they no longer live
   next to the `.output/chrome-mv3` build or the fixtures directory they used to resolve
   relative to their own file location.
3. **The confirmation-gated scenario moved too, even though `evals/` doesn't include it
   in the reliability task set.** `apps/extension/e2e/confirmation-gated-task.spec.ts`
   still needs it; keeping every scenario in one shared location (rather than splitting
   "reliability scenarios" from "safety scenarios" across two packages) is simpler to
   navigate and avoids a second scenarios directory for one file.
4. **`evals/`'s task set (`TASK_SET`) includes only the three read-only scenarios** —
   not `form-fill-confirmation`. That scenario is a safety/security proof (#32), not a
   "did the agent complete a normal task reliably" measurement; scoring it as a
   reliability task would conflate two different questions.
5. **Scoring reads the side panel's own rendered text, not internal state.** `runner.ts`
   polls `document.body.innerText` until a terminal status word appears, then regexes
   out the step/replan counts and checks for the expected summary substring — the exact
   signal a human watching the side panel would see, not a peek into `RunManager`
   internals. A task passes only when it reaches `done` **and** contains the expected
   summary — reaching a terminal state for the wrong reason, or the right one without
   the right content, still fails (`scorer.ts`).
6. **Live mode never reads a credential from the environment implicitly** — only from an
   explicit `--api-key` CLI flag (`cli-args.ts`), matching BYOK: nothing runs against a
   real provider unless the caller deliberately supplies a key on the command line for
   that one invocation.
7. **`pnpm eval`'s regression check is mock mode only**, wired into the same CI job as
   the E2E suite (`e2e & reliability eval` in `.github/workflows/ci.yml`) rather than a
   separate job — it needs the identical build + headed Chromium + Xvfb setup the E2E
   job already has, so adding a step there avoids a second full environment setup. Live
   mode stays a manual, local-only invocation; it's never reachable from CI since no
   secret is ever available to supply `--api-key`.
8. **`turbo.json`'s `eval` task gained `dependsOn: ["^build"]`**, and `evals/package.json`
   takes a `devDependency` on `@aegis/extension` purely to give turbo that build-ordering
   edge — `evals` never imports the extension's code, only needs its `.output/chrome-mv3`
   build artifact to exist on disk before running.

## Consequences

- `packages/eval-harness` gained its own small test (`find-ref.test.ts`) for its one
  piece of pure logic; the I/O-heavy pieces (launching a browser, serving fixtures, a
  fake HTTP server) are validated the same way #31/#32 always were — by actually running
  the E2E suite and the eval, not by mocking Node's `http`/`playwright` APIs.
- `evals/` has real unit tests for its pure logic (`cli-args.ts`'s argument parsing and
  live-provider-config resolution, `scorer.ts`, `report.ts`) — 19 tests, all pure,
  no browser needed.
- Verified end-to-end by actually running `pnpm --filter @aegis/evals eval` against the
  real built extension: all three tasks pass, and the CLI's exit code is 0 on a clean
  pass and 1 on a bad `--mode=live` invocation (verified both).
- `seed-chrome-storage.ts` (`eval-harness`) and `seed-live-chrome-storage.ts` (`evals`)
  are two small, separately-named modules rather than one generalized function, purely
  so each stays inside a file whose name contains "chrome" — this repo's own ESLint
  convention (`no-restricted-globals`/`no-deprecated` exemptions) requires it.

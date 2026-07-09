# Changelog

All notable changes to this project are documented in this file. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-07-09

Initial release. Every milestone in `PROGRESS.md` (M0–M7, issues #1–#35) is implemented,
gated, and tested. Full rationale for every real design decision is in `docs/adr/` (22
ADRs).

### Added

- **Foundation** — WXT (Manifest V3) + TypeScript monorepo (pnpm + Turborepo), strict
  TypeScript across every package, shared `Result<T,E>`/typed-error/storage/logging
  kernel (`@aegis/shared`).
- **LLM layer (BYOK)** — provider registry over the Vercel AI SDK (OpenAI, Anthropic,
  Google, Ollama, any OpenAI-compatible endpoint), prompted structured output with
  JSON-repair, and per-agent-role model routing (`@aegis/llm`).
- **Perception** — a hybrid CDP accessibility-tree + DOM + vision-fallback pipeline,
  normalized to stable element refs and budgeted into a token-bounded payload
  (`@aegis/perception`).
- **Actions** — a typed action schema registry with a risk classifier
  (`read`/`navigate`/`input`/`state_changing`), CDP-backed executors, and a retrying
  action runner (`@aegis/actions`).
- **Agent loop** — a resumable XState state machine coordinating Planner, Navigator,
  and Verifier roles, with step/replan guardrails and pause/resume/stop controls
  (`@aegis/agent`).
- **Security core** — untrusted-content sanitization (invisible-character stripping +
  indirect-prompt-injection pattern neutralization), a per-site policy engine with a hard
  deny-list, a mandatory human confirmation gate for state-changing actions, an
  independent alignment critic, and a WebCrypto-encrypted secret vault where the model
  never sees a real credential value — only a `‹secret:name›` placeholder resolved at
  native-fill time (`@aegis/security`).
- **UI** — a side panel (task input, live status, action trace, confirmation gate) and a
  tabbed options page (Models & Keys, Permissions, Secrets) wired to the real, non-mock
  composition root in `apps/extension/entrypoints/background.ts`.
- **Test infrastructure** — a shared E2E/eval harness (`@aegis/eval-harness`) driving the
  real built extension against local fixture pages with a local fake-model server; a
  Playwright E2E suite (read-only use cases, a confirmation-gated safety-path case, two
  indirect-prompt-injection security scenarios); a reliability eval harness (`evals/`,
  mock + live modes, scored report, `pnpm eval`) wired into CI as a regression check.
- Chrome and Edge builds (`pnpm build` / `pnpm --filter @aegis/extension build:edge`),
  both verified to load and run a real task end-to-end.

### Fixed (found while building the test suites, not regressions from a prior release)

- A `navigate`/`open_tab` action was policy-checked against the _current_ page's origin,
  never its destination — meaning an injected "navigate to a deny-listed origin"
  instruction would have bypassed the hard deny-list entirely. Fixed in
  `apps/extension/background/policy-service.ts` (`docs/adr/0022`).
- `background/policy-service.ts` never passed a target element's accessible name to the
  policy engine, so the `STATE_CHANGING_KEYWORDS` risk-elevation path (e.g. a button
  literally named "Buy Now") could never actually trigger in the real running system.
  Fixed by threading perception through the `policyCheck` state (`docs/adr/0020`).

[0.1.0]: https://github.com/code-with-rashid/aegis-browser/releases/tag/v0.1.0

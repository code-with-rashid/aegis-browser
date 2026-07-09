# Aegis — Progress

Source of truth for what's built and what's next. Work **one unblocked issue at a time** —
the lowest issue number whose every "Blocked by" issue is closed. See `CLAUDE.md` for the
working agreement and `BUILD_PROMPT.md` for full issue specs.

Repo: https://github.com/code-with-rashid/aegis-browser

## Milestone / issue checklist

### M0 — Foundation

- [x] #1 Scaffold WXT + TypeScript monorepo — blocked by: none
- [x] #2 Tooling & quality gates — blocked by: #1
- [x] #3 Shared kernel — blocked by: #1

### M1 — LLM layer (BYOK)

- [x] #4 Provider registry & LLM client — blocked by: #3
- [x] #5 Structured output + JSON-repair — blocked by: #4
- [x] #6 Per-agent model routing — blocked by: #4, #3

### M2 — Perception

- [x] #7 CDP session manager — blocked by: #3
- [x] #8 Accessibility-tree extractor & normalizer — blocked by: #7
- [x] #9 DOM pruner & content extractor — blocked by: #7
- [x] #10 Perception aggregator & budgeter — blocked by: #8, #9
- [x] #11 Vision fallback (scaffold) — blocked by: #10

### M3 — Actions

- [x] #12 Action schema registry & risk classifier — blocked by: #3
- [x] #13 CDP action executors — blocked by: #12, #8, #7
- [x] #14 Action runner — blocked by: #13

### M4 — Agent loop

- [x] #15 XState loop machine — blocked by: #3, #14, #10
- [x] #16 Planner agent — blocked by: #15, #5, #6, #10
- [x] #17 Navigator agent — blocked by: #15, #5, #6, #10, #12
- [x] #18 Verifier — blocked by: #15, #10
- [x] #19 Loop guardrails & controls — blocked by: #15, #14

### M5 — Security core

- [x] #20 Trust-tagging & sanitizer — blocked by: #3
- [x] #21 Security policy engine — blocked by: #12, #3
- [x] #22 Confirmation gate — blocked by: #21, #15
- [x] #23 Alignment critic — blocked by: #21, #5
- [x] #24 Secret vault & native fill — blocked by: #3, #13

### M6 — UI

- [x] #25 Side panel shell & messaging bridge — blocked by: #3, #19
- [x] #26 Action trace / log UI — blocked by: #25, #15
- [x] #27 Confirmation gate UI — blocked by: #25, #22
- [x] #28 Options — models & keys — blocked by: #25, #6
- [x] #29 Options — permissions panel — blocked by: #25, #21
- [ ] #30 Options — secret vault UI — blocked by: #25, #24

### M7 — Integration, evals, release

- [ ] #31 E2E: read-only use cases — blocked by: #16, #17, #18, #19, #26
- [ ] #32 E2E: confirmation-gated task — blocked by: #27, #22, #23
- [ ] #33 Reliability eval harness — blocked by: #31
- [ ] #34 Security test suite — blocked by: #20, #22, #23, #32
- [ ] #35 Cross-browser build, docs & v0.1.0 — blocked by: all prior issues

## ADR log

- [0001](docs/adr/0001-ollama-via-openai-compatible.md) — Ollama support implemented as a
  preset over the generic OpenAI-compatible adapter rather than a dedicated SDK
  dependency.
- [0002](docs/adr/0002-structured-output-via-prompted-json-not-sdk-object-mode.md) —
  `generateStructured` parses/repairs prompted JSON itself instead of the AI SDK's
  (deprecated) `generateObject`/`Output.object` mode.
- [0003](docs/adr/0003-perception-aggregator-scope.md) — AX/DOM ref merging by shared
  backend node id, and "compress history" scoped to compressing one payload (the agent
  loop owns history-list policy).
- [0004](docs/adr/0004-tab-actions-via-chrome-tabs-not-cdp-target.md) — Tab actions
  (open/switch/close) go through a `chrome.tabs`-backed `TabManager` port, not CDP's
  `Target` domain, since CDP target ids and `chrome.tabs` ids are different id spaces.
- [0005](docs/adr/0005-agent-loop-machine-design.md) — Agent loop machine adds a
  `Planning -> Done` shortcut and a `Stopped` terminal beyond `docs/DESIGN.md`'s diagram;
  persisted context never holds raw `Error` instances (plain-data summaries only).
- [0006](docs/adr/0006-navigator-llm-action-schema-mirror.md) — Navigator validates LLM
  output against a transform-free mirror of `ActionSchema` (`z.toJSONSchema` can't
  represent `.transform()`), then re-parses through the real schema to get branded refs.
- [0007](docs/adr/0007-verifier-outcome-and-replanning.md) — Verifier outcome is
  three-way (`achieved`/`continue`/`failed`), with a new `Verifying -> Replanning` edge
  for `failed`; heuristic-first (any action failure ⇒ `failed`, no model call needed).
- [0008](docs/adr/0008-loop-guardrails.md) — Step/replan budgets enforced via dedicated
  `always`-only gate states; every service takes a trailing `signal?: AbortSignal` so
  `STOP` cancels in-flight work, not just the state transition (already immediate).
- [0009](docs/adr/0009-policy-decision-matrix.md) — Policy engine's risk x mode decision
  matrix: deny-list wins unless a stored policy is explicitly `mode: "allow"`;
  `state_changing` risk only skips confirmation when `mode: "allow"` AND
  `allowStateChanging: true` both hold.
- [0010](docs/adr/0010-confirmation-gate.md) — Confirmation gate: `PolicyCheckOutput`
  becomes a three-way `allow/confirm/deny` decision (locally typed, no
  `@aegis/agent` → `@aegis/security` import); `deny` routes to `replanning`, not
  `failed`; `EDIT` self-transitions within `confirming` to revise pending actions.
- [0011](docs/adr/0011-alignment-critic.md) — Alignment critic: new `aligning` state
  between `policyCheck` and `confirming`; `!aligned` routes to `replanning` (never asks
  the human), same pattern as a policy `deny`; always calls the model (no heuristic
  shortcut, unlike the Verifier — alignment is inherently semantic).
- [0012](docs/adr/0012-secret-vault.md) — Secret vault: a canary record (a known
  plaintext, encrypted under the derived key) detects a wrong passphrase safely even on
  an empty vault; placeholder resolution lives in `@aegis/security` (not
  `@aegis/actions`, wrong layering direction), as a pre-processing step before an action
  reaches the existing CDP executors.
- [0013](docs/adr/0013-side-panel-composition-root.md) — Side panel composition root:
  a `createPolicyService` adapter bridges `@aegis/security`'s per-action `PolicyEngine`
  to `@aegis/agent`'s per-batch `PolicyService`; two storage areas (session for loop
  state, local for durable config); one active run at a time with rehydration on
  startup; `LoopRunOutcome` gains `paused` so the UI can distinguish it from `active`.
- [0014](docs/adr/0014-action-trace-log-ui.md) — Action trace: `@aegis/agent` gains
  `buildTraceStep` (pure, per-step) but accumulation/persistence/broadcast lives in
  `apps/extension`'s `run-manager.ts`; one `TraceStep[]` array serves both a live
  timeline and a completed-run replay, no separate replay mode.
- [0015](docs/adr/0015-confirmation-gate-ui.md) — Confirmation gate UI: native `<dialog>`
  - `showModal()` for real focus-trap/inert-background semantics; Escape (`cancel`) is
    treated as an explicit Reject, never a silent dismiss; Edit only offers per-action
    free-text fields, and Save still requires a separate Approve afterward.
- [0016](docs/adr/0016-options-models-and-keys.md) — Options page: connection test runs
  directly from the options page (same `host_permissions` CORS bypass as the background,
  no round-trip needed) via an injectable `ProviderFactory`; one explicit Save gated on
  every role parsing to a valid `ProviderConfig`; options page opens in its own tab via
  WXT's per-entrypoint `<meta name="manifest.open_in_tab">` convention.
- [0017](docs/adr/0017-options-permissions-panel.md) — Options permissions panel: options
  page becomes tabbed (Models & Keys / Permissions); `PermissionsPanel` takes an injected
  `PolicyStore` (unlike #28's untested `App.tsx` orchestration) since #29's acceptance
  criteria explicitly requires tests; per-row auto-save, no page-level Save button, since
  each origin's policy is independent; deny-list view is read-only.

## Notes

- Phase A (bootstrap: labels, milestones, issues #1-#35) completed 2026-07-08.
- Now entering Phase B build loop starting at #1.

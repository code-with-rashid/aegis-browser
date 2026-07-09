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
- [ ] #24 Secret vault & native fill — blocked by: #3, #13

### M6 — UI

- [ ] #25 Side panel shell & messaging bridge — blocked by: #3, #19
- [ ] #26 Action trace / log UI — blocked by: #25, #15
- [ ] #27 Confirmation gate UI — blocked by: #25, #22
- [ ] #28 Options — models & keys — blocked by: #25, #6
- [ ] #29 Options — permissions panel — blocked by: #25, #21
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

## Notes

- Phase A (bootstrap: labels, milestones, issues #1-#35) completed 2026-07-08.
- Now entering Phase B build loop starting at #1.

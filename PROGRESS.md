# Aegis — Progress

Source of truth for what's built and what's next. Work **one unblocked issue at a time** —
the lowest issue number whose every "Blocked by" issue is closed. See `CLAUDE.md` for the
working agreement and `BUILD_PROMPT.md` for full issue specs.

Repo: https://github.com/code-with-rashid/aegis-browser

## Milestone / issue checklist

### M0 — Foundation

- [x] #1 Scaffold WXT + TypeScript monorepo — blocked by: none
- [x] #2 Tooling & quality gates — blocked by: #1
- [ ] #3 Shared kernel — blocked by: #1

### M1 — LLM layer (BYOK)

- [ ] #4 Provider registry & LLM client — blocked by: #3
- [ ] #5 Structured output + JSON-repair — blocked by: #4
- [ ] #6 Per-agent model routing — blocked by: #4, #3

### M2 — Perception

- [ ] #7 CDP session manager — blocked by: #3
- [ ] #8 Accessibility-tree extractor & normalizer — blocked by: #7
- [ ] #9 DOM pruner & content extractor — blocked by: #7
- [ ] #10 Perception aggregator & budgeter — blocked by: #8, #9
- [ ] #11 Vision fallback (scaffold) — blocked by: #10

### M3 — Actions

- [ ] #12 Action schema registry & risk classifier — blocked by: #3
- [ ] #13 CDP action executors — blocked by: #12, #8, #7
- [ ] #14 Action runner — blocked by: #13

### M4 — Agent loop

- [ ] #15 XState loop machine — blocked by: #3, #14, #10
- [ ] #16 Planner agent — blocked by: #15, #5, #6, #10
- [ ] #17 Navigator agent — blocked by: #15, #5, #6, #10, #12
- [ ] #18 Verifier — blocked by: #15, #10
- [ ] #19 Loop guardrails & controls — blocked by: #15, #14

### M5 — Security core

- [ ] #20 Trust-tagging & sanitizer — blocked by: #3
- [ ] #21 Security policy engine — blocked by: #12, #3
- [ ] #22 Confirmation gate — blocked by: #21, #15
- [ ] #23 Alignment critic — blocked by: #21, #5
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

(none yet — add entries here as `docs/adr/NNNN-title.md` decisions are made)

## Notes

- Phase A (bootstrap: labels, milestones, issues #1-#35) completed 2026-07-08.
- Now entering Phase B build loop starting at #1.

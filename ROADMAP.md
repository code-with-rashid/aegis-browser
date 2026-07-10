# Aegis — Roadmap

Aegis is built in **product phases**. Each phase is a self-contained, autonomous build
prompt you hand to Claude Code; it creates that phase's GitHub issues and works through
them one at a time until the version is shipped. Do them in order.

> Note: "Phase A/B/C" mentioned inside a build prompt are just the _mechanics_ of one build
> (bootstrap → issue loop → release). The **Phase 1/2/3** below are the _product_ stages.

| Phase | Version | Focus                                              | Issues       | Prompt file                             | Status                |
| ----- | ------- | -------------------------------------------------- | ------------ | --------------------------------------- | --------------------- |
| **1** | v0.1    | Safe, reliable, local-first agent (MVP)            | ~35 (M0–M7)  | `BUILD_PROMPT.md`                       | ✅ Planned & runnable |
| **2** | v0.2    | Tool-use: MCP + WebMCP; tool governance            | 14 (M8–M12)  | `PHASE_2_PROMPT.md`                     | ✅ Planned & runnable |
| **3** | v0.3    | Self-healing workflows + scheduled/background runs | 14 (M13–M17) | `PHASE_3_PROMPT.md`                     | ✅ Planned & runnable |
| **4** | v0.4    | Firefox, store distribution, sharing, polish       | TBD          | `PHASE_4_PROMPT.md` _(not written yet)_ | 💡 Idea only          |

## How to run each phase

Run inside the repo, in Claude Code, **after the previous phase is merged and green**:

- **Phase 1:** `Read BUILD_PROMPT.md and execute it fully and autonomously.`
- **Phase 2:** `Read PHASE_2_PROMPT.md and execute it fully and autonomously.`
- **Phase 3:** `Read PHASE_3_PROMPT.md and execute it fully and autonomously.`

## If a session runs out of context (resume any phase)

`Resume <PHASE_FILE>. Read CLAUDE.md, PROGRESS.md, and the open issues, then continue.`

Because all state lives in git + GitHub issues + `PROGRESS.md`, a fresh session always
picks up exactly where the last one stopped.

## Living-document note

Phases 2 and 3 were planned up front so the whole roadmap is runnable, but their details
partly depend on what the MVP actually produces. **Skim and refresh `PHASE_2_PROMPT.md`
after v0.1 ships, and `PHASE_3_PROMPT.md` after v0.2 ships** — a 10-minute review, not a rewrite.

## Files in this kit

- `setup-aegis-repo.sh` — creates the public GitHub repo (run once, first).
- `CLAUDE.md` — the coding rulebook every session follows.
- `docs/DESIGN.md` — the full architecture (from `Aegis_MVP_Design_Spec.md`).
- `BUILD_PROMPT.md` — Phase 1 plan (from `AEGIS_CLAUDE_CODE_BUILD_PROMPT.md`).
- `PHASE_2_PROMPT.md`, `PHASE_3_PROMPT.md` — the next two phases.
- `ROADMAP.md` — this file.

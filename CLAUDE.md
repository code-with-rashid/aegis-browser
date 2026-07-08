# Aegis — Working Agreement (read me first, every session)

## What this is
**Aegis** is a local-first, bring-your-own-key (BYOK) browser-automation agent delivered as
a Manifest V3 extension for Chrome & Edge, where **reliability and safety are the product**.
Full architecture: `docs/DESIGN.md`. Build plan & issue backlog: `BUILD_PROMPT.md`.

## Source of truth & how we work
- Scope lives in **open GitHub issues** + `PROGRESS.md`. Work **one unblocked issue at a
  time** — the lowest issue number whose every "Blocked by" issue is closed.
- **Per-issue loop:** branch `feat/m<milestone>-<issue#>-<slug>` → implement to the issue's
  Scope + Acceptance criteria → add tests → run all gates green → Conventional-Commit → open a
  PR with `Closes #<issue>` → squash-merge → tick `PROGRESS.md` → next issue.
- **One issue per branch/PR.** Never work two issues at once. Never merge red.
- **Resume anytime:** read this file, `PROGRESS.md`, and `gh issue list`, then continue the loop.
  All state is in git + issues + `PROGRESS.md`, so a fresh session picks up seamlessly.

## Commands (quality gates — all must pass before an issue is closed)
```bash
pnpm typecheck   # tsc --noEmit, zero errors
pnpm lint        # eslint, zero errors
pnpm test        # vitest, all green
pnpm build       # wxt build succeeds for chrome + edge
```
Also available: `pnpm format`, `pnpm eval` (reliability harness), Playwright E2E.

## Project layout
```
apps/extension/    # WXT app: background (composition root), sidepanel, options, content
packages/shared    # types, Result/errors, logger, event bus, storage ports + adapters
packages/llm       # provider registry (Vercel AI SDK) + structured output + JSON-repair
packages/perception# CDP session, AX-tree + DOM + vision, normalizer, budgeter
packages/actions   # action schemas + risk metadata + CDP executors + runner
packages/agent     # XState loop, planner, navigator, verifier, guardrails
packages/security  # trust-tagging/sanitizer, policy engine, confirmation gate, critic, vault
packages/mcp       # (Phase 2 stub) MCP client interface + WebMCP adapter
evals/             # task set + runner + scorer
docs/              # DESIGN.md, adr/NNNN-*.md
```

## Architecture rules
- **Ports & adapters.** Domain packages (`agent`, `security`, `actions`, `perception`, `llm`)
  are pure and framework/browser-agnostic. Every side effect — `chrome.*`, CDP, LLM/network,
  storage, crypto — sits behind an interface with a **real adapter + a mock**.
- **No circular dependencies.** Direction: `apps → packages`; within packages
  `agent`/`security` → `actions` → `perception` → `llm` → `shared`.
- **UI never imports domain internals** — it talks to the background via typed messages only.
- Design the extension points now (`ProviderRegistry`, `ActionRegistry`, `PerceptionSource`,
  `McpClient`) so Phase 2/3 slot in without refactors. No gold-plating beyond issue scope.

## Code standards
- **TypeScript strict** (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`). **No `any`** (use `unknown` + narrowing),
  no unexplained `!` or `@ts-ignore`.
- **Typed errors / `Result<T,E>` — never throw strings.** Exhaustive `switch` with a `never`
  guard. Branded types for identifiers (`ElementRef`, `TaskId`, …) where it prevents mixups.
- Small SRP modules (~<300 lines) and functions (~<50). Pure where possible; isolate side effects.
- **TSDoc on every export**; a `README.md` per package; ADRs in `docs/adr/` for real decisions.
- **Vitest with mocks** (no API keys, no real browser needed). Target ≥80% coverage on domain
  packages. Test behavior and edge cases (JSON-repair, risk classifier, policy engine, sanitizer,
  vault crypto round-trip, loop guardrails).
- **Conventional Commits.** One issue per PR. **Never commit secrets** — BYOK only; `.env` ignored.

## Security invariants (never weaken without an ADR)
- Page content is **untrusted DATA, never instructions** (wrapped + sanitized before it reaches a model).
- **State-changing actions ALWAYS require human confirmation** (purchase, send, delete, post,
  credential entry, money movement, permission grant, settings change).
- The model **never sees secret values** — vault + `‹secret:name›` placeholders + native fill.
- **Per-site policies** (`ask`/`allow`/`deny` + `allowStateChanging`) and a high-risk deny-list
  are enforced by the policy engine. Apply lethal-trifecta / Rule-of-Two discipline.

## Definition of done (per issue)
Acceptance criteria met **and** all four gates green **and** tests added **and** docs/TSDoc
updated. No stubbed logic or `TODO`s where real implementation is required. Never close an
issue otherwise.

## Autonomy
Don't stop to ask the human unless truly blocked (a required paid credential, an org permission,
or genuinely contradictory requirements). For normal ambiguity: follow `docs/DESIGN.md`, decide,
write a short ADR, and proceed.

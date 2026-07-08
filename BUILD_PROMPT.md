# Aegis — Autonomous Build Prompt for Claude Code

> **Paste this entire file to Claude Code as your first instruction**, or save it at the repo root as `BUILD_PROMPT.md` and tell Claude Code:
> *"Read `BUILD_PROMPT.md` and execute it fully and autonomously. Begin with Phase A, then loop Phase B until every issue is closed, then Phase C. Do not stop until the extension builds and loads."*
>
> If a session runs out of context, just start a new one and say: *"Resume executing `BUILD_PROMPT.md`. Read `CLAUDE.md`, `PROGRESS.md`, and the open GitHub issues, then continue Phase B."* The plan is designed to be fully resumable.

---

## 0. Placeholders to fill (human)

- **GitHub repo:** `<OWNER>/aegis-browser` — create it first with the setup script (it makes the repo **public**), or let Claude Code create it with `gh repo create --public`.
- **Default branch:** `main`.
- Everything else is decided in this document. If a repo already exists, Claude Code should adapt.
- (Recommended) Save the companion design document as `docs/DESIGN.md` in the repo before starting. If it is absent, treat Section 4 of this file as the canonical architecture.

---

## 1. Your mission (Claude Code)

You are the **sole senior engineer** building a product called **Aegis** from zero to a working, loadable browser extension. Operate **autonomously and continuously**:

1. **Phase A — Bootstrap:** set up the repository, tooling, `CLAUDE.md`, and create **all** GitHub issues from the backlog in Section 7, in order, with labels, milestones, and dependencies.
2. **Phase B — Build loop:** repeatedly pick the next unblocked issue, implement it to spec, pass all quality gates, merge it, close it, and move on — **one issue at a time** — until no open issues remain.
3. **Phase C — Finalize:** produce a loadable build, write install/usage docs, tag `v0.1.0`.

Hold a **professional quality bar** at every step (Section 5). Never close an issue whose acceptance criteria are unmet or whose quality gates fail. Prefer correctness and clarity over speed. When something is ambiguous, follow `docs/DESIGN.md`, then this document; if still unclear, make a reasonable, documented decision (write a short ADR) and proceed — **do not stall waiting for the human** unless truly blocked (see Section 10).

---

## 2. What you are building (product brief)

**Aegis** is a **local-first, bring-your-own-key (BYOK) browser-automation agent** delivered as a **Manifest V3 extension** for Chrome and Edge, where **reliability and safety are the product**.

**Positioning:** *Private, reliable, safe web automation that runs in your own logged-in browser.* It is a better-architected alternative to Nanobrowser: everything runs locally, the user supplies their own LLM API keys, and no data goes to any Aegis server.

**Why it wins:** it fuses two things no open extension has combined — **hybrid perception** (accessibility tree + pruned DOM + vision fallback) for reliability, and a **security-first architecture** (trust boundary, alignment critic, mandatory confirmation on risky actions, encrypted secret vault, per-site permissions) that is **on by default**.

**MVP goals**

- Execute multi-step natural-language web tasks in Chrome & Edge with a **measurably higher success rate** than a DOM-index-only baseline, verified by an eval harness.
- **100%** of state-changing actions (purchase, send, delete, post, credential entry, money movement, permission grant) are gated behind explicit human confirmation.
- **Zero credentials in the LLM prompt** — logins go through an encrypted vault + native form fill.
- Survive a baseline **indirect prompt-injection** test suite with no exfiltration and no unauthorized state change.
- Every run produces a **replayable, human-readable trace**.

**Non-goals (do not build in MVP):** CAPTCHA solving / bot-evasion (use human handoff), autonomous purchases without confirmation, headless/scheduled runs, record→replay workflow compiler, cloud sync/accounts, remote telemetry. MCP/WebMCP and workflows are **designed for but not implemented** now — leave clean extension points.

---

## 3. Locked tech stack

| Layer | Choice | Notes |
|---|---|---|
| Extension framework | **WXT** (MV3, Vite) | Cross-browser; Chrome+Edge first, Firefox-ready |
| Language | **TypeScript** (strict) | No `any`; see Section 5 |
| UI | **React + Tailwind CSS + shadcn/ui** | Side panel + options pages |
| UI state | **Zustand** | Lightweight |
| Agent loop | **XState** v5 | Explicit, resumable state machine |
| LLM + tools | **Vercel AI SDK (v6/7)** | Provider-agnostic; `generateObject`, tool-calling, approvals |
| Schemas/validation | **Zod** | Tool args, structured output, storage schemas |
| Perception/control | **`chrome.debugger` → CDP** | AX tree, DOM, screenshots, input; content-script fast path |
| Secret storage | **WebCrypto** (AES-GCM + PBKDF2) | Local encrypted vault |
| Extensibility (later) | `@modelcontextprotocol/sdk` client + WebMCP adapter | Phase 2 — interfaces only for now |
| Testing | **Vitest** (unit) + **Playwright** (E2E) + eval harness | Mocks for LLM/CDP so tests need no keys |
| Monorepo | **pnpm workspaces + Turborepo** | |
| Tooling | **ESLint + Prettier + Husky + lint-staged + GitHub Actions** | |

Do not substitute major stack elements without writing an ADR justifying it.

---

## 4. Architecture (canonical summary)

Four MV3 surfaces coordinated by a background service worker that owns the agent loop and the single CDP connection. **Domain logic is framework-agnostic and browser-agnostic** — `chrome.*`, CDP, and LLM providers are all hidden behind interfaces so they can be mocked and swapped.

**Monorepo layout**

```
aegis-browser/
├─ apps/extension/                 # WXT app (thin: wiring + UI only)
│  ├─ entrypoints/
│  │  ├─ background.ts              # composition root: builds & runs the loop, owns CDP session
│  │  ├─ sidepanel/                 # React: chat, trace, confirmation gate
│  │  ├─ options/                   # React: models, permissions, vault
│  │  └─ content.ts                 # lightweight DOM ops / element highlighting
│  └─ wxt.config.ts
├─ packages/
│  ├─ shared/         # types, Result/error types, logger, event bus, storage ports + chrome adapter + in-memory mock
│  ├─ llm/            # provider registry (AI SDK adapters) + structured output + JSON-repair; MockProvider
│  ├─ perception/     # CDP session port, AX-tree + DOM + vision extractors, normalizer, budgeter; FakeCdp
│  ├─ actions/        # action schemas + risk metadata + CDP executors + action runner
│  ├─ agent/          # XState loop machine, planner, navigator, verifier, guardrails
│  ├─ security/       # trust-tagging/sanitizer, policy engine, confirmation gate, alignment critic, secret vault
│  └─ mcp/            # (Phase 2 stub) client interface + WebMCP adapter placeholder
├─ evals/             # task set + runner + scorer (mock + live modes)
├─ docs/              # DESIGN.md, adr/NNNN-*.md
├─ .github/workflows/ci.yml
├─ CLAUDE.md
├─ PROGRESS.md
└─ turbo.json, pnpm-workspace.yaml, package.json, tsconfig.base.json
```

**Dependency rule (enforce it):** `apps/extension` → `packages/*`; within packages the direction is `agent`/`security` → `actions` → `perception` → `llm` → `shared`. **No circular dependencies.** UI never imports domain internals directly — it talks to the background via typed messages. Abstract every side-effecting boundary (browser APIs, CDP, network/LLM, storage, crypto) behind an interface defined in the consuming package; provide a real adapter and a mock.

**Agent loop:** `Planning → Perceiving → Deciding → PolicyCheck → (Confirming?) → Acting → Verifying → (loop | Planning | Done | Failed | Paused)`. Two agents (**Planner** = strong model; **Navigator** = fast model) plus a **Verifier** (did the sub-goal succeed?) and an **Alignment critic** (is a risky action aligned with the user's real intent?). Loop state is persisted to `chrome.storage.session` after every transition so it is resumable and survives worker eviction.

**Perception:** accessibility tree (`Accessibility.getFullAXTree`) is primary; each element gets a **stable `ref`**; pruned DOM + readable-content extraction augments it; **screenshot+vision is a fallback only** when structure is missing/ambiguous. A per-step token budget ranks elements by relevance to the active goal to prevent DOM-dump blow-up.

**Security (all on by default):** (1) page text enters the model wrapped as **untrusted data, never instructions**, sanitized of hidden/imperative content; (2) an **alignment critic** vets every state-changing action; (3) **mandatory human confirmation** for state-changing actions with a plain-language preview; (4) an encrypted **secret vault** — the model never sees secret values (uses `‹secret:name›` placeholders + native fill); (5) **per-site policies** (`ask`/`allow`/`deny` + `allowStateChanging`) and a high-risk deny-list. Apply the *lethal-trifecta / Rule-of-Two* discipline: never allow untrusted content + private data + exfiltration to run unsupervised in one step.

*(Full detail lives in `docs/DESIGN.md`. If present, it is the source of truth over this summary.)*

---

## 5. Engineering standards & quality bar (non-negotiable)

The user's explicit requirement is **clean, professional, well-organized, solid, extensible, maintainable** code. Enforce all of the following.

**Architecture & design**
- Layered / ports-and-adapters. Domain packages contain **pure, testable logic**; all I/O is behind interfaces injected at the composition root (`background.ts`). No package reaches for `chrome.*` directly except its own adapter.
- Single Responsibility: small modules and functions. If a file exceeds ~300 lines or a function ~50, reconsider.
- Favor pure functions and immutable data. Isolate side effects.
- Design the **extension points now**: `ProviderRegistry`, `ActionRegistry`, `PerceptionSource`, and an `McpClient` interface — so Phase 2/3 slot in without refactors.
- No premature abstraction and no gold-plating beyond the issue's scope — but never violate the architecture to save time.

**TypeScript**
- `strict: true`, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`.
- **No `any`** (use `unknown` + narrowing). No non-null `!` assertions unless commented and justified. No `@ts-ignore` without a reason comment.
- Model errors explicitly: a `Result<T, E>` type or typed error classes — **no throwing strings**, no silent catch. Exhaustive `switch` with a `never` guard for unions.
- Use branded types for identifiers where it prevents mixups (e.g., `ElementRef`, `IssueId`).

**Testing**
- **Vitest** unit tests colocated per package; every package ships tests. AAA structure. Use the mock adapters (MockProvider, FakeCdp, in-memory storage) so **tests require no API keys and no real browser**.
- Test behavior and edge cases, not implementation details. Cover: the JSON-repair path, the risk classifier, the policy engine, the trust sanitizer, the vault crypto round-trip, the loop guardrails/stall detector.
- Playwright E2E for the wired flows (Section 7, M7). Target ≥ 80% line coverage on domain packages (`agent`, `security`, `actions`, `perception`, `llm`).
- A change that breaks a test is not "done" — fix the code or the test with justification.

**Documentation**
- TSDoc on every exported symbol (what/why, not restating the signature). A `README.md` per package describing its responsibility and public API.
- Record significant decisions as ADRs in `docs/adr/NNNN-title.md` (context, decision, consequences).
- Keep `docs/DESIGN.md` and `CLAUDE.md` updated when reality diverges.

**Git & GitHub hygiene**
- **Conventional Commits** (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`), scoped where useful (`feat(perception): ...`).
- **One issue → one feature branch → one focused PR.** Branch name `feat/m<milestone>-<issue#>-<slug>`.
- PR body: what changed, why, how tested, and `Closes #<issue>`. Keep diffs reviewable.
- Never commit secrets, API keys, `.env`, tokens, or build artifacts. Provide `.env.example` only. Add a `.gitignore` early.

**Security & privacy hygiene**
- BYOK only — never hardcode or default any provider key. Keys/secrets live in encrypted local storage.
- Never weaken the confirmation gate, trust boundary, or vault for convenience. Security behavior changes require an ADR.
- Validate all external/model input with Zod at the boundary.

**Quality gates (must pass before an issue is closed):**
```
pnpm typecheck   # tsc --noEmit, zero errors
pnpm lint        # eslint, zero errors (warnings triaged)
pnpm test        # vitest, all green
pnpm build       # wxt build succeeds for chrome + edge
```
Wire these as root scripts in Phase A so they exist from issue #1 onward.

---

## 6. Phase A — Repository bootstrap (do once, first)

Perform these steps before creating issues, committing directly to `main`:

1. **Repo & git.** Ensure a git repo on `main` (the setup script may have already created and pushed a public repo). If none exists on GitHub, run `gh repo create <OWNER>/aegis-browser --public --source . --remote origin` (confirm `gh auth status` first). Ensure a comprehensive `.gitignore` (node, dist, .env, .turbo, coverage, .wxt).
2. **Ensure `CLAUDE.md`** exists at the repo root (it may already be committed as a standalone file — if so, keep it). If missing, write it from the seed in Section 11. This file governs every future session.
3. **Write `docs/DESIGN.md`** (use the companion design doc if provided; otherwise expand Section 4 into a full document). Add `PROGRESS.md` with the milestone/issue checklist.
4. **Create labels:**
   `type:foundation, type:feature, type:security, type:ui, type:test, type:docs`,
   `area:llm, area:perception, area:actions, area:agent, area:security, area:ui, area:evals, area:infra`,
   `priority:P0, priority:P1`, `status:blocked`.
   Example: `gh label create "area:perception" --color 1D76DB --force`.
5. **Create milestones** `M0 Foundation` … `M7 Integration & Release` (`gh api` or `gh milestone` per the installed extension; if unavailable, encode milestone as a `milestone:M0` label).
6. **Create every issue** in Section 7, **in listed order**, so issue numbers match backlog order in a fresh repo. Each issue body must contain: **Goal**, **Scope** (task checklist), **Acceptance criteria** (checklist), **Blocked by** (issue refs), labels, milestone. Record the backlog#→issue# mapping in `PROGRESS.md`.
   Template:
   ```
   gh issue create --title "M2·#8 Accessibility-tree extractor & normalizer" \
     --label "type:feature,area:perception,priority:P0" --milestone "M2 Perception" \
     --body-file /tmp/issue-08.md
   ```
7. **Commit** the bootstrap (`chore: bootstrap repo, tooling, docs, and issue backlog`) and push to `main`.

> Note: repo scaffolding and tooling are themselves the first issues (#1, #2). In Phase A you create the *issue records*; you implement them in Phase B. The only code you write in Phase A is config needed for `gh`/git plus the three docs.

---

## 7. Issue backlog (create exactly these, in order)

Each entry: **Goal · Scope · Acceptance criteria · Blocked by · labels/milestone.** Keep acceptance criteria as the definition of done.

### M0 — Foundation

**#1 Scaffold WXT + TypeScript monorepo** · `type:foundation, area:infra, M0`
- Goal: an empty-but-runnable WXT extension in a pnpm+Turbo monorepo.
- Scope: init pnpm workspace + Turbo; create `apps/extension` via WXT with React+TS; create empty `packages/{shared,llm,perception,actions,agent,security,mcp}` with `package.json`, `tsconfig`, `src/index.ts`, `README.md`; `tsconfig.base.json` with strict flags; Tailwind + shadcn/ui set up in the extension.
- Acceptance: `pnpm install` clean; `pnpm build` produces a loadable Chrome MV3 build; extension loads with a placeholder side panel; workspaces resolve.
- Blocked by: none.

**#2 Tooling & quality gates** · `type:foundation, area:infra, M0`
- Goal: enforce quality from day one.
- Scope: ESLint (strict TS + import rules, no-cycles) + Prettier; root scripts `typecheck/lint/test/build/format`; Vitest config; Husky pre-commit → lint-staged; GitHub Actions `ci.yml` running the four gates on PRs; `.env.example`.
- Acceptance: all four gate scripts run; CI green on a trivial PR; pre-commit blocks a lint error.
- Blocked by: #1.

**#3 Shared kernel** · `type:foundation, area:infra, M0`
- Goal: cross-cutting primitives.
- Scope: `Result<T,E>` + typed error base; structured `logger`; a typed `EventBus`; **storage port** (`get/set/remove`, namespaced, Zod-validated) with a `chrome.storage` adapter and an in-memory mock; core domain types (`ElementRef`, `TaskId`, message contracts between background↔UI).
- Acceptance: unit tests for storage adapter (via mock) and Result helpers; no `chrome.*` reference outside the adapter.
- Blocked by: #1.

### M1 — LLM layer (BYOK)

**#4 Provider registry & LLM client** · `type:feature, area:llm, M1`
- Goal: provider-agnostic model access behind one interface.
- Scope: `LlmProvider` interface; AI SDK adapters for OpenAI, Anthropic, Google, Ollama, and generic OpenAI-compatible; a `ProviderRegistry`; a **`MockProvider`** for tests; timeout/abort + error mapping.
- Acceptance: registry returns a working client per config; MockProvider drives tests; no key is ever logged.
- Blocked by: #3.

**#5 Structured output + JSON-repair** · `type:feature, area:llm, M1`
- Goal: never crash on imperfect model JSON (Nanobrowser's #1 bug).
- Scope: `generateStructured(schema, prompt)` using `generateObject`; fallback that strips markdown fences and repairs/parses JSON; bounded retries with schema-violation feedback; typed failure result.
- Acceptance: unit tests cover fenced JSON, trailing commas, partial objects, and hard-fail after N retries.
- Blocked by: #4.

**#6 Per-agent model routing** · `type:feature, area:llm, M1`
- Goal: assign different models per agent role.
- Scope: Zod-validated config (`planner`/`navigator`/`verifier`/`critic` → provider+model+params); persisted via storage port; sensible defaults.
- Acceptance: routing resolves the right client per role; round-trips through storage; validated.
- Blocked by: #4, #3.

### M2 — Perception

**#7 CDP session manager** · `type:feature, area:perception, M2`
- Goal: safe lifecycle over `chrome.debugger`.
- Scope: `CdpSession` port (attach/detach/send, typed commands, event subscribe); real adapter over `chrome.debugger`; reconnect/detach on tab close; **`FakeCdp`** for tests; surface the debugger-banner reality in docs.
- Acceptance: attach/detach lifecycle tested via FakeCdp; errors typed; no leaks on tab close.
- Blocked by: #3.

**#8 Accessibility-tree extractor & normalizer** · `type:feature, area:perception, M2`
- Goal: semantic page model with stable refs.
- Scope: pull `Accessibility.getFullAXTree`; normalize to `PerceivedElement {ref, role, name, value, state, bounds, source}`; assign stable refs; map ref→backend node for actions.
- Acceptance: deterministic normalization tested on recorded AX fixtures; refs stable across re-reads.
- Blocked by: #7.

**#9 DOM pruner & content extractor** · `type:feature, area:perception, M2`
- Goal: fill AX gaps + real content extraction (re-enable what Nanobrowser disabled).
- Scope: interactive+text-node pruning via CDP DOM; readable main-content extraction; merge-ready output.
- Acceptance: extractor returns clean content on article/list fixtures within a size cap; tested.
- Blocked by: #7.

**#10 Perception aggregator & budgeter** · `type:feature, area:perception, M2`
- Goal: one compact payload under a token budget.
- Scope: merge AX+DOM (dedupe), relevance-rank vs the active goal, enforce a token budget, compress history; output `PerceptionPayload`.
- Acceptance: over-budget pages get ranked/truncated deterministically; unit-tested; token estimate exposed.
- Blocked by: #8, #9.

**#11 Vision fallback (scaffold)** · `type:feature, area:perception, M2`
- Goal: see canvas/icon-only UIs when structure is missing.
- Scope: `Page.captureScreenshot` + element-bounds mapping behind a `useVision` flag; a `PerceptionSource` the aggregator can request on demand; not on by default.
- Acceptance: screenshot capture works behind the flag; interface lets the loop request vision; tested with FakeCdp.
- Blocked by: #10.

### M3 — Actions

**#12 Action schema registry & risk classifier** · `type:feature, area:actions, M3`
- Goal: typed actions with built-in risk metadata.
- Scope: Zod schemas for `click, input_text, scroll, navigate, go_back, open_tab, switch_tab, close_tab, get_dropdown_options, select_dropdown_option, send_keys, wait, extract, done`; each tagged `read|navigate|input|state_changing`; an `ActionRegistry` (extensible for MCP later); the `STATE_CHANGING` policy list.
- Acceptance: schemas validate/reject fixtures; classifier returns correct risk incl. the state-changing set; unit-tested.
- Blocked by: #3.

**#13 CDP action executors** · `type:feature, area:actions, M3`
- Goal: perform actions by stable ref.
- Scope: executor per action via CDP (ref→node, click/type/scroll/tab/dropdown/keys/navigate), using real input events; typed results; screenshot-on-failure hook.
- Acceptance: executors tested against FakeCdp; ref-not-found and element-detached handled gracefully.
- Blocked by: #12, #8, #7.

**#14 Action runner** · `type:feature, area:actions, M3`
- Goal: orchestrate execution with resilience.
- Scope: run an action list sequentially; capture results into memory; bounded retry; **stall detection** (same action/target repeated → signal replan); abort support.
- Acceptance: runner tested for success, retry, stall-signal, and abort paths.
- Blocked by: #13.

### M4 — Agent loop

**#15 XState loop machine** · `type:feature, area:agent, M4`
- Goal: the resumable orchestration core.
- Scope: implement the state chart from Section 4; persist state to `chrome.storage.session` on every transition; hydrate on startup; expose stop/pause/resume; inject planner/navigator/verifier/policy as services.
- Acceptance: machine transitions tested with mocked services; a killed+rehydrated run resumes correctly.
- Blocked by: #3, #14, #10.

**#16 Planner agent** · `type:feature, area:agent, M4`
- Goal: decompose & replan.
- Scope: prompt + `generateStructured` for plan/sub-goals/done-decision; consumes only sanitized perception; higher-temp model via routing.
- Acceptance: produces a valid plan schema on fixtures; replans on an injected obstacle; tested with MockProvider.
- Blocked by: #15, #5, #6, #10.

**#17 Navigator agent** · `type:feature, area:agent, M4`
- Goal: choose the next action(s).
- Scope: prompt + structured output → validated `AgentBrain` with `actions[]`; references only perceived refs; low-temp model.
- Acceptance: emits schema-valid actions bound to real refs; rejects hallucinated refs; tested with MockProvider.
- Blocked by: #15, #5, #6, #10, #12.

**#18 Verifier** · `type:feature, area:agent, M4`
- Goal: stop compounding error.
- Scope: after acting, compare fresh perception to the sub-goal; return achieved/continue/failed; cheap model or heuristic.
- Acceptance: correctly judges success/failure on fixtures; tested.
- Blocked by: #15, #10.

**#19 Loop guardrails & controls** · `type:feature, area:agent, M4`
- Goal: never loop forever; always stoppable.
- Scope: max-step and max-replan budgets; wire stall detector to force replan; global stop/pause/resume surfaced to UI; graceful termination + summary.
- Acceptance: budgets enforced; stall forces replan; stop halts within one step; tested.
- Blocked by: #15, #14.

### M5 — Security core

**#20 Trust-tagging & sanitizer** · `type:security, area:security, priority:P0, M5`
- Goal: page content can never act as instructions.
- Scope: wrap all page-derived text in an untrusted envelope; strip hidden text, zero-width chars, and instruction-like imperatives; system-prompt contract enforcing data-not-instructions.
- Acceptance: injection fixtures (hidden "ignore previous instructions", spoofed system text) are neutralized in tests.
- Blocked by: #3.

**#21 Security policy engine** · `type:security, area:security, priority:P0, M5`
- Goal: per-site gating of actions.
- Scope: `SitePolicy {origin, mode: ask|allow|deny, allowStateChanging, expiresAt}`; persisted; high-risk deny-list default; API `evaluate(action, origin) → allow|confirm|deny`.
- Acceptance: matrix of risk×policy tested exhaustively; deny-list blocks by default.
- Blocked by: #12, #3.

**#22 Confirmation gate** · `type:security, area:security, priority:P0, M5`
- Goal: mandatory human approval for risky actions.
- Scope: when policy says `confirm`, suspend the loop, emit a confirmation request (action + human-readable preview), await approve/edit/reject; resume only on approve; map onto AI SDK approvals pattern.
- Acceptance: state-changing actions never execute without approval; reject triggers replan; tested end-to-end with mocks.
- Blocked by: #21, #15.

**#23 Alignment critic** · `type:security, area:security, priority:P0, M5`
- Goal: catch injected/misaligned actions.
- Scope: before a state-changing action, a second model pass checks alignment with the user's original intent; block+explain on misalignment; cheap model.
- Acceptance: blocks an injected off-intent action in a fixture; passes aligned actions; tested with MockProvider.
- Blocked by: #21, #5.

**#24 Secret vault & native fill** · `type:security, area:security, priority:P0, M5`
- Goal: credentials never touch the prompt.
- Scope: WebCrypto AES-GCM vault, key from user passphrase via PBKDF2; store/retrieve named secrets; expose `‹secret:name›` placeholders to the model; native CDP fill resolves placeholders at execution; 2FA always hands off.
- Acceptance: encrypt→decrypt round-trip tested; model context contains only placeholders (asserted); wrong passphrase fails safely.
- Blocked by: #3, #13.

### M6 — UI

**#25 Side panel shell & messaging bridge** · `type:ui, area:ui, M6`
- Goal: the main surface + typed background↔panel channel.
- Scope: React side panel (chat input, run controls, status); typed port messaging; Zustand store; start/stop/pause wired to the loop.
- Acceptance: user can start a run and see live status; messages typed end-to-end; stop works.
- Blocked by: #3, #19.

**#26 Action trace / log UI** · `type:ui, area:ui, M6`
- Goal: auditable, replayable steps.
- Scope: live timeline (reasoning, action, target, result per step); expandable raw perception; replay view.
- Acceptance: trace updates live during a run; steps expandable; renders a completed run from history.
- Blocked by: #25, #15.

**#27 Confirmation gate UI** · `type:ui, area:ui, priority:P0, M6`
- Goal: the human decision point.
- Scope: modal with specific preview ("Send email to X?"), Approve / Edit / Reject; blocks until resolved; keyboard-accessible.
- Acceptance: appears for state-changing actions; each choice drives the correct loop outcome; a11y-checked.
- Blocked by: #25, #22.

**#28 Options — models & keys** · `type:ui, area:ui, M6`
- Goal: BYOK configuration.
- Scope: add/edit providers + keys (masked), per-agent routing UI, connection test; persisted.
- Acceptance: saved config drives real runs; keys masked and never logged.
- Blocked by: #25, #6.

**#29 Options — permissions panel** · `type:ui, area:ui, M6`
- Goal: manage per-site policy.
- Scope: list/add/edit/remove site policies, toggle `allowStateChanging`, view deny-list.
- Acceptance: edits change gate behavior at runtime; tested.
- Blocked by: #25, #21.

**#30 Options — secret vault UI** · `type:ui, area:ui, priority:P0, M6`
- Goal: manage credentials safely.
- Scope: unlock with passphrase; add/remove named secrets; show where used; clear "the agent never sees the value" affordance.
- Acceptance: vault unlock/add/remove works; values never rendered to logs/prompt.
- Blocked by: #25, #24.

### M7 — Integration, evals, release

**#31 E2E: read-only use cases** · `type:test, area:evals, M7`
- Goal: prove the core loop.
- Scope: Playwright runs for "research & extract", "compare & summarize", "authenticated read" against fixture sites; wire any remaining gaps.
- Acceptance: all three complete reliably in CI headed mode with a mock/local model.
- Blocked by: #16, #17, #18, #19, #26.

**#32 E2E: confirmation-gated task** · `type:test, area:evals, priority:P0, M7`
- Goal: prove the safety path.
- Scope: form-fill task that must pause at submit; assert no submit without approval; assert reject→replan.
- Acceptance: gate fires; unauthorized submit impossible; tested.
- Blocked by: #27, #22, #23.

**#33 Reliability eval harness** · `type:test, area:evals, M7`
- Goal: make reliability a number.
- Scope: versioned task set (seed from the use cases); runner with mock + live modes; scoring + report; a regression check usable in CI.
- Acceptance: `pnpm eval` runs the set and emits a scored report; documented how to add tasks.
- Blocked by: #31.

**#34 Security test suite** · `type:security, area:evals, priority:P0, M7`
- Goal: verify the safety claims.
- Scope: corpus of indirect-prompt-injection pages (hidden instructions, spoofed CAPTCHA, malicious URLs, exfil bait); assert zero exfiltration and zero unauthorized state change.
- Acceptance: suite runs in CI; all attacks blocked; failures block release.
- Blocked by: #20, #22, #23, #32.

**#35 Cross-browser build, docs & v0.1.0** · `type:docs, area:infra, M7`
- Goal: shippable.
- Scope: verify Chrome + Edge builds; `README` with install (load-unpacked) + BYOK setup + usage; `docs/` polish; version + `CHANGELOG`; tag `v0.1.0`.
- Acceptance: fresh clone → `pnpm install && pnpm build` → loads in Chrome & Edge and runs a demo task; docs let a new user set up BYOK and run.
- Blocked by: all prior issues.

---

## 8. Phase B — Autonomous build loop (repeat until no open issues)

For each iteration:

1. **Select** the open issue with the **lowest number whose every "Blocked by" issue is closed**. (Consult `PROGRESS.md` + `gh issue list`.)
2. **Branch:** `git switch -c feat/m<milestone>-<issue#>-<slug>`.
3. **Implement** strictly to the issue's Scope + Acceptance criteria, obeying Section 5 and `CLAUDE.md`. Write TSDoc and a package README section as you go.
4. **Test:** add/extend unit tests (and E2E where relevant) using mocks. 
5. **Gate:** run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. All must pass. Fix until green — never disable a check to pass.
6. **Commit** (Conventional Commits), **push**, open a **PR** with `Closes #<issue>` and a what/why/testing summary.
7. **Merge** once gates + CI are green: `gh pr merge --squash --delete-branch`. This closes the issue.
8. **Record:** tick the item in `PROGRESS.md`; note any decisions as ADRs.
9. **Context hygiene:** if context is getting large, `/compact` or end the session cleanly. State lives in git + issues + `PROGRESS.md`, so a new session resumes seamlessly.
10. **Loop** to step 1.

**Never** work two issues in one branch, close an issue with failing gates or stubbed acceptance criteria, or leave `TODO`/placeholder logic where the issue requires real implementation.

---

## 9. Phase C — Finalization & overall Definition of Done

When no open issues remain:
- `pnpm build` yields loadable Chrome **and** Edge extensions in `dist/`.
- A fresh clone can: install deps, build, load unpacked, add a BYOK key, and complete at least one demo task end to end, with the confirmation gate firing on a state-changing step.
- `pnpm test`, `pnpm eval`, and the security suite all pass in CI.
- README + docs are complete; `v0.1.0` tagged; `PROGRESS.md` shows every issue closed.

Then post a final summary comment (what was built, how to run it, known limitations, and the Phase 2/3 roadmap hooks left in place).

---

## 10. Guardrails / do-nots

- **Autonomy:** do not stop to ask the human unless truly blocked (e.g., a required paid credential, an org permission, or genuinely contradictory requirements). For normal ambiguity, decide, write an ADR, and proceed.
- **No secrets in the repo, ever.** BYOK only; no default keys; `.env` git-ignored.
- **Don't require real API keys to pass tests** — mocks only. Live testing is optional/manual and documented, not a gate.
- **Don't weaken security** (gate, trust boundary, vault, critic) for convenience or to make a test pass.
- **Don't expand scope** beyond the current issue; capture new ideas as new issues instead.
- **Don't merge red.** Gates and CI must be green.
- **Don't fork the architecture** (Section 4 dependency rule) — no shortcuts that create cycles or leak `chrome.*` into domain code.

---

## 11. `CLAUDE.md` seed (write this to the repo in Phase A)

```md
# Aegis — Working Agreement (read me first, every session)

## What this is
Aegis: a local-first, BYOK, MV3 browser-automation agent for Chrome/Edge where
reliability and safety are the product. Full architecture in docs/DESIGN.md.

## How we work
- Source of truth for scope: open GitHub issues + PROGRESS.md. Work ONE unblocked
  issue at a time, lowest number whose blockers are closed.
- Per issue: branch feat/m<ms>-<issue#>-<slug> → implement → test → 
  `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (all green) →
  Conventional-Commit → PR "Closes #N" → squash-merge → tick PROGRESS.md.
- Resume anytime by reading this file, PROGRESS.md, and `gh issue list`.

## Architecture rules
- Ports & adapters. Domain packages (agent, security, actions, perception, llm)
  are pure and framework/browser-agnostic. chrome.*, CDP, LLM, storage, crypto are
  behind interfaces with a real adapter + a mock. No cycles. Dep direction:
  apps → packages; agent/security → actions → perception → llm → shared.
- UI talks to background via typed messages only.

## Code standards
- TS strict (+ noUncheckedIndexedAccess, exactOptionalPropertyTypes). No `any`,
  no unexplained `!`/`@ts-ignore`. Typed errors / Result — never throw strings.
- Small SRP modules (<~300 lines) and functions (<~50). Pure where possible.
- TSDoc on exports; README per package; ADRs in docs/adr for real decisions.
- Vitest with mocks (no keys/no real browser needed); ≥80% coverage on domain pkgs.
- Conventional Commits; one issue per PR; never commit secrets; BYOK only.

## Security invariants (never weaken without an ADR)
- Page content is untrusted DATA, never instructions (wrapped + sanitized).
- State-changing actions ALWAYS require human confirmation.
- The model never sees secret values (vault + `‹secret:name›` placeholders).
- Per-site policies + high-risk deny-list enforced by the policy engine.

## Definition of done (per issue)
Acceptance criteria met + all four gates green + tests added + docs updated.
Never close an issue otherwise.
```

---

## 12. Handling things that need a human

- **LLM API keys:** BYOK by design. Tests never need them (MockProvider). The final extension expects the *user* to add a key at runtime — document this; don't hardcode anything.
- **`gh` auth / repo creation:** if `gh` isn't authenticated or the repo can't be created, that's a genuine blocker — state exactly what's needed and pause. Otherwise proceed.
- **Live-site flakiness:** prefer local fixture pages for deterministic E2E; note any live-only checks as manual QA in the issue, not as gates.
- **The `chrome.debugger` banner** is expected; document it, use the content-script fast path where possible, don't try to hide it.

---

*Begin now with Phase A. Create `CLAUDE.md`, `docs/DESIGN.md`, and `PROGRESS.md`; set up labels, milestones, and all 35 issues; then enter the Phase B loop and keep going until the extension is complete.*

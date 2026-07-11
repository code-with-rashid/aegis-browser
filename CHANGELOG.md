# Changelog

All notable changes to this project are documented in this file. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] — 2026-07-11

Phase 3: record→compile self-healing workflows. Every milestone in `PROGRESS.md`
(M13–M17, issues #108–#121) is implemented, gated, and tested. Full rationale for every
real design decision is in `docs/adr/` (ADRs 0042–0055).

### Added

- **A new `@aegis/workflows` package** — a `Workflow` is a versioned, parameterized,
  ordered sequence of recorded tool calls plus a `RunPolicy` (what it's pre-authorized to
  do with no one watching). Depends only on `@aegis/agent`/`@aegis/actions`/
  `@aegis/perception`/`@aegis/security`/`@aegis/shared`.
- **Record a completed run as a workflow** — the side panel gains a "Save as workflow"
  field once a run reaches Done; the exact recorded steps (what was clicked, typed, or
  extracted) become a new, reusable workflow with one click.
- **Deterministic replay with zero LLM calls** — a saved workflow re-runs its recorded
  steps by dispatching each straight through the same tool-call mechanism every tool
  source already uses, no Planner/Navigator/Verifier involved at all.
- **Self-heal repairs one broken step at a time** — when a step's target can't be found
  (the site changed since it was recorded), the same Navigator the live loop uses proposes
  a fix for just that step, gated by risk before it ever executes: a state-changing fix
  always needs a human's confirmation when attended, and always hard-stops rather than
  auto-applying when unattended — self-heal can retarget a workflow, never expand what
  it's authorized to do.
- **A background run engine** drives a real, non-active managed tab inside the service
  worker, checkpointing progress after every step so an MV3 eviction mid-run loses at
  most one step in flight; a `chrome.alarms`-based scheduler (every-N-minutes or daily)
  triggers a run with no side panel or active tab ever needed.
- **"Safe autonomy" guardrails for unattended runs** — a workflow's own origin, step
  count, and each recorded step's tool id/risk are checked against its `RunPolicy` before
  anything executes; every `‹secret:name›` placeholder resolves through the vault first,
  hard-stopping (never leaking the raw placeholder) if it can't; a blocked run notifies
  the user via `chrome.notifications`.
- **Options — Workflows tab** — list saved workflows, run one on demand with its own
  parameter values, view a full step-by-step run history, and a dedicated builder to
  view/reorder/delete steps, add/remove/edit params of either kind (a plain overridable
  value or a vault-backed secret), edit the `RunPolicy`, and enable/configure scheduling.
- **A workflow eval and a dedicated security suite** — `pnpm eval` now measures self-heal
  end-to-end (a clean replay costs zero model calls; a healed replay after a simulated
  site change completes via one bounded Navigator call, never a full re-plan); a new
  Playwright E2E suite proves an unattended background run can't be hijacked into an
  unauthorized state change by injected page content, and that a step outside its
  `RunPolicy` allow-list never executes even when its target genuinely exists.

### Fixed (found while building Phase 3, not regressions from v0.2.0)

- `createRunRecorder` (#109) was built as a pure, tested library function but never
  actually wired into the live agent loop — there was no way, anywhere in the shipped UI,
  to turn a completed run into a workflow at all, silently blocking the entire feature for
  a real user despite #118/#119's management UI already existing. Fixed by subscribing
  `background/run-manager.ts` to the same trace-building transition edge and adding a
  real "Save as workflow" action to the side panel. (`docs/adr/0055`)
- Writing the workflow security suite (#120) surfaced a pre-existing gap in
  `@aegis/agent`'s Navigator prompt builder: it sanitizes free-text page content and a
  tool's own description, but never an individual page element's own accessible name —
  ordinary visible page text reaches the Navigator's prompt completely raw, for the live
  loop as much as for a workflow heal. Not fixed (a `packages/agent` concern spanning the
  whole product, out of scope for a workflows issue) — documented for a future issue; the
  structural safety net (`gateHeal`'s unattended state-changing hard-stop) never depended
  on catching this to hold. (`docs/adr/0054`)

## [0.2.0] — 2026-07-10

Phase 2: MCP + WebMCP tool calling. Every milestone in `PROGRESS.md` (M8–M12, issues
#80–#93) is implemented, gated, and tested. Full rationale for every real design decision
is in `docs/adr/` (ADRs 0028–0040).

### Added

- **Unified `Tool` abstraction** (`@aegis/actions`) — a browser action, an MCP tool, and a
  WebMCP tool all implement the same `{id, source, description, inputSchema, risk,
execute}` shape; the agent loop's authoritative decision became a source-agnostic
  `ToolCall {toolId, args}`.
- **MCP client** (`@aegis/mcp`) over Streamable HTTP (the official
  `@modelcontextprotocol` SDK, no stdio) — user-configured servers (URL, name, an optional
  auth header referencing a vault secret by name, never a raw value), connected fresh on
  every task start.
- **Deny-by-default tool permissioning** — every discovered MCP/WebMCP tool starts
  denied until explicitly reviewed and allowed; risk is inferred fail-safe to
  `state_changing` whenever a tool doesn't declare itself read-only.
- **WebMCP fast-path** — pages declaring their own tools (`document.modelContext`) are
  feature-detected automatically; the Navigator prefers a declared tool over driving the
  DOM when one covers the sub-goal, with a global off switch and an automatic DOM
  fallback when a page declares nothing.
- **Tool-call-aware trace and confirmation gate** — a `state_changing` MCP/WebMCP call
  now gets the same plain-language confirmation preview (tool id, source, args summary) a
  browser action always has; the trace shows a visible source badge and an expandable
  args/result detail per call.
- **Options — Tools & MCP tab** — add/enable/disable/remove MCP servers, discover a
  server's tools and their input schemas, set per-tool allow/deny, and toggle WebMCP
  globally, all taking effect on the very next task start.
- **Tool-use E2E, reliability, and security coverage** — Playwright scenarios completing
  tasks via a real MCP server and a WebMCP fixture tool; the reliability eval harness
  (`pnpm eval`) now covers both; the security suite gained hostile-tool corpus cases (a
  malicious tool description attempting prompt injection, hostile MCP/WebMCP tools baiting
  an unauthorized call), all proven blocked by the existing sanitizer/policy/critic/
  confirmation stack with no weakening of any of them.

### Fixed (found while building Phase 2, not regressions from v0.1.x)

- Both content scripts were shipping ~215KB heavier than necessary — `packages/mcp`
  lacked `sideEffects: false`, so bundlers couldn't tree-shake the unused
  `@modelcontextprotocol/sdk`/testing-module imports pulled in transitively through its
  flat barrel export. Fixed, plus moved test-only exports to a `@aegis/mcp/testing`
  subpath. (`docs/adr/0035`)
- A WebMCP tool-call race: `registerWebMcpTools` cached a page's tool list from an async
  `publish()` call, so a call request arriving before that promise settled produced a
  false "Unknown WebMCP tool." Fixed by always re-fetching the page's live tool list at
  call time. (`docs/adr/0035`)
- The action trace indexed the browser-only `proposedActions` against the all-sources
  `lastRunSummary.toolCalls`, which would misalign the moment a batch mixed an MCP call
  with a browser one (never triggered before, since no MCP tool had ever run live). Fixed
  to correlate against `proposedToolCalls` instead. (`docs/adr/0034`)
- The reliability eval scorer's summary match was case-_sensitive_, silently
  incompatible with a scenario whose rendered summary is deliberately lowercased — only
  surfaced once a second scenario (`webmcp-shipping`) was added to the reliability task
  set and scored by this path for the first time. Fixed to match case-insensitively, the
  same standard the E2E suite's own assertions already used. (`docs/adr/0040`)

## [0.1.1] — 2026-07-10

Reliability fixes found by running the eval harness (`evals/`) in live mode against a
real model (`gpt-4o-mini`) instead of only the scripted mock suite. No new features; the
four issues below were the actual, reproducible root causes behind the flaky/failing runs
this surfaced. Full rationale for each in `docs/adr/`.

### Fixed

- Navigator/Planner element-ref prompt format was ambiguous (`- [el:3] textbox "..."`) —
  a real model reliably copied the brackets into the ref itself, causing hallucinated-ref
  corrections it didn't always self-fix. Changed to a labeled, quoted format
  (`ref="el:3" role="..." name="..."`) with no delimiter character to fold in.
  (`docs/adr/0024`)
- The DOM-based interactive pruner never filtered hidden elements, so an element hidden
  by its own click handler (click-to-reveal, submit-to-hide-form) kept being offered to
  the Navigator, which re-proposed the same already-executed action against it —
  producing a CDP click failure and wasted verification steps. Fixed by skipping a hidden
  element's entire subtree while walking the DOM. (`docs/adr/0025`)
- `input_text` inserted text via CDP without clearing existing field content first, so a
  retried or replanned `input_text` against the same field appended instead of
  overwriting — once a model mistyped a value, the field could never again hold exactly
  the intended text. Fixed by selecting all existing content before inserting.
  (`docs/adr/0026`)
- The Navigator's prompt only ever included the Planner's paraphrased sub-goal, never the
  original task — when a paraphrase dropped a literal value (e.g. a code, a search term)
  the sub-goal needed, the Navigator had no way to recover it and fabricated a
  placeholder instead. Fixed by threading the overall task through to the Navigator's
  prompt. (`docs/adr/0027`)

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

[0.2.0]: https://github.com/code-with-rashid/aegis-browser/releases/tag/v0.2.0
[0.1.1]: https://github.com/code-with-rashid/aegis-browser/releases/tag/v0.1.1
[0.1.0]: https://github.com/code-with-rashid/aegis-browser/releases/tag/v0.1.0

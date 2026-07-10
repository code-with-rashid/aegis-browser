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
- [x] #30 Options — secret vault UI — blocked by: #25, #24

### M7 — Integration, evals, release

- [x] #31 E2E: read-only use cases — blocked by: #16, #17, #18, #19, #26
- [x] #32 E2E: confirmation-gated task — blocked by: #27, #22, #23
- [x] #33 Reliability eval harness — blocked by: #31
- [x] #34 Security test suite — blocked by: #20, #22, #23, #32
- [x] #35 Cross-browser build, docs & v0.1.0 — blocked by: all prior issues

### M8 — Tool abstraction

- [x] #80 P2-1 Unified `Tool` + `ToolRegistry` — blocked by: none
- [x] #81 P2-2 Tool-calling in the agent loop — blocked by: #80
- [x] #82 P2-3 Tool risk gating — blocked by: #81

### M9 — MCP client

- [x] #83 P2-4 MCP client (Streamable HTTP) — blocked by: none
- [x] #84 P2-5 MCP server configuration + storage — blocked by: #83
- [x] #85 P2-6 MCP tools → ToolRegistry — blocked by: #84, #81, #82
- [x] #86 P2-7 MCP permissioning — blocked by: #85

### M10 — WebMCP fast-path

- [x] #87 P2-8 WebMCP detection + adapter — blocked by: #80
- [x] #88 P2-9 WebMCP preferred-action routing — blocked by: #87, #82

### M11 — UX & governance

- [x] #89 P2-10 Tools & MCP management UI — blocked by: #86, #87
- [ ] #90 P2-11 Trace + confirmation for tool calls — blocked by: #82

### M12 — Integration & release

- [ ] #91 P2-12 E2E: MCP + WebMCP tasks — blocked by: #88, #90
- [ ] #92 P2-13 Tool-use evals + security suite — blocked by: #91
- [ ] #93 P2-14 Docs + v0.2 — blocked by: #92

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
- [0018](docs/adr/0018-options-secret-vault-ui.md) — Options secret vault UI: "show where
  used" means the `‹secret:name›` placeholder token (with Copy), not a usage log —
  nothing in `@aegis/agent` associates a secret with a site or run; `SecretVaultPanel`
  takes an injected `SecretVault`, tested against a real `createMemoryStorage()`-backed
  vault; no reveal for an existing secret's value, re-adding a name overwrites it.
- [0019](docs/adr/0019-e2e-read-only-use-cases.md) — E2E read-only use cases: fixture
  sites served locally; "mock/local model" is a real local HTTP server speaking the OpenAI
  chat-completions wire format (verified against the real adapter directly); scripted
  Navigator responses extract real element refs from the actual prompt text rather than
  hardcoding any; two tabs (fixture + side-panel-as-a-tab) with the fixture kept active via
  `bringToFront()` right before Start, since `chrome.tabs.query({active:true})` decides
  which tab the run targets. **Discovered but not fixed**: `background/policy-service.ts`
  never passes `riskContext` to `PolicyEngine.evaluate`, so the state-changing keyword
  elevation never actually triggers in the real running system — left for #32 to close,
  since that issue is about the confirmation gate and a confirmation-gated E2E case would
  otherwise never confirm.
- [0020](docs/adr/0020-e2e-confirmation-gated-task.md) — E2E confirmation-gated task:
  closed the #31-discovered gap first — `PolicyCheckInput` gained an optional
  `perception`, threaded through `policyCheck`'s invoke input, and
  `background/policy-service.ts` now resolves each action's target element name and passes
  it as `ActionRiskContext` to `PolicyEngine.evaluate`, so a "Buy Now" click genuinely
  elevates to `state_changing` and requires confirmation. The E2E scenario scripts the
  Critic `aligned: true` (this issue tests the human gate, not alignment) and asserts the
  fixture's own DOM state (`#purchased` stays hidden) both mid-confirmation and after
  reject, not just the loop's self-reported status.
- [0021](docs/adr/0021-reliability-eval-harness.md) — Reliability eval harness: extracted
  `packages/eval-harness` from #31/#32's E2E specs (fixtures, scenarios, fake model
  server, extension launcher) so the same versioned scenarios drive both correctness (CI
  E2E) and reliability (`evals/`) with no risk of drift; `evals/`'s task set is only the
  three read-only scenarios (not the confirmation-gated one — that's a safety proof, not
  a reliability measurement); live mode only ever reads a credential from an explicit
  `--api-key` flag, never the environment; `pnpm eval` (mock mode) is wired into the same
  CI job as the E2E suite as the regression check.
- [0022](docs/adr/0022-security-test-suite.md) — Security test suite: found and fixed a
  real gap while building it — `navigate`/`open_tab` actions were policy-checked against
  the _current_ origin, never the destination, so an injected "navigate to chase.com"
  would have sailed past the hard deny-list; fixed with `originToCheck` in
  `background/policy-service.ts`. Corpus tests split what they guarantee (imperative
  phrasing gets neutralized) from what they document as a known content-layer limitation
  (spoofed-CAPTCHA/malicious-URL bait is linguistically indistinguishable from legitimate
  copy — the real defenses are the destination-origin check and the secret vault, not
  text matching). Two new E2E scenarios deliberately script a "compromised" Navigator that
  falls for the injection, proving the Critic/policy-engine backstop still stops the
  induced action before it ever runs.
- [0023](docs/adr/0023-v0-1-0-release.md) — v0.1.0 release: Edge verified empirically
  (real `msedge` binary, real build, a real demo task run end-to-end) rather than assumed
  Chromium-equivalent; no permanent Edge CI job, since `ubuntu-latest` runners don't have
  Edge and Chrome's build already exercises the identical MV3 code path on every PR;
  `docs/DESIGN.md` polished (not rewritten) to fix genuinely stale bits; root `README.md`
  fully rewritten with install/BYOK/usage instructions cross-checked against the actual
  rendered UI text, not written from memory.
- [0024](docs/adr/0024-unambiguous-element-ref-format.md) — Unambiguous element-ref
  prompt format (post-v0.1.0, issue #71): the first live-model eval run (real
  `gpt-4o-mini`) surfaced a real bug — the `[el:3]`-bracketed ref format in the Navigator/
  Planner prompts caused the model to hallucinate refs by copying the brackets. Changed to
  labeled, quoted `ref="el:3" role="..." name="..."` fields with no ambiguous delimiter;
  verified against the real model via a logging proxy — 0 ref-hallucination corrections
  across a re-run that previously hit dozens.
- [0025](docs/adr/0025-filter-hidden-elements-from-dom-pruner.md) — Filter hidden
  elements from the DOM pruner (post-v0.1.0, issue #73): re-running the live-model eval
  after #71's fix surfaced the two findings ADR 0024 deferred — an `ACTION_RUN_FAILED`
  click failure on `compare-and-summarize` and a verification-loop timeout on
  `authenticated-read`. Both traced to one root cause: `interactive-pruner.ts` never
  filtered hidden elements, so an element hidden by its own click handler kept being
  offered to the Navigator, which re-proposed the same already-executed action against
  it. Fixed by skipping a hidden element's entire subtree (matching `display:none`
  semantics) in the DOM pruner.
- [0026](docs/adr/0026-clear-before-input-text.md) — Select existing content before
  `input_text` inserts (post-v0.1.0, issue #75): a follow-up live-model run of
  `authenticated-read` (after #73's fix) showed a run where the model briefly mistyped
  the access code, then correctly retried — but never recovered, timing out at 20+ more
  identical-looking steps. `executeInputText` called `Input.insertText` straight after
  `.focus()`, which inserts at the cursor rather than replacing content, so every retry
  appended instead of overwriting and the field's value could never again exactly equal
  what the model intended. Fixed by selecting all existing content before inserting;
  re-verified live — `authenticated-read` now reaches `Done` in ~4-5 steps instead of
  timing out.
- [0027](docs/adr/0027-navigator-overall-task-context.md) — Give the Navigator the
  overall task, not just the sub-goal (post-v0.1.0, issue #77): a third, distinct
  root cause behind `authenticated-read`'s flakiness — the Navigator's prompt only ever
  saw the Planner's paraphrased sub-goal, never the original task, so when a paraphrase
  dropped a literal value (e.g. "Access the webpage for the members area" instead of
  "Enter access code 1234..."), the model had no way to recover the real value and
  fabricated a placeholder instead (`<access_code>`-style), persistently, for the whole
  run. Fixed by threading `task` through `DecideInput` into the Navigator's prompt.
  Re-verified live across many repeated runs — zero timeouts; remaining occasional
  failures are unrelated to Aegis (free-text summary wording variance, and once an
  OpenRouter 402 from the test account running low on credits).
- [0028](docs/adr/0028-unified-tool-and-toolregistry.md) — Unified `Tool` + `ToolRegistry`
  (Phase 2, issue #80): the unwired Phase-1 `ActionRegistry` stub is replaced outright
  (nothing outside its own tests referenced it) by a `Tool`/`ToolContext`/`ToolResult`
  shape browser actions, MCP tools, and WebMCP tools all implement; `ToolContext` is
  currently just `ExecutorContext`, since non-browser tools capture their own transport
  via closure at registration time instead.
- [0029](docs/adr/0029-tool-calling-agent-loop.md) — Tool-calling in the agent loop
  (Phase 2, issue #81): `DecideOutput` carries both a derived, browser-only `actions` view
  (still feeding the not-yet-tool-call-aware policy engine/critic/confirmation/trace,
  unchanged) and the authoritative `toolCalls`; `AgentLoopContext` keeps `proposedActions`
  and `proposedToolCalls` in lockstep, including through an `EDIT`.
  `createToolCallActService` reuses the existing `ActionRunner` for browser-sourced calls
  (retry/stall/history preserved exactly) and calls straight through `ToolRegistry` for
  any other tool. Supersedes ADR 0006 — the transform-free `LlmActionSchema` mirror is no
  longer needed now that the Navigator's wire schema is generic `{toolId, args:
z.unknown()}`, with per-tool schemas rendered as prompt text instead
  (`unrepresentable: 'any'`).
- [0030](docs/adr/0030-tool-risk-gating.md) — Tool risk gating (Phase 2, issue #82):
  `@aegis/security`'s policy engine no longer knows about `Action` at all —
  `PolicyEngine.evaluate(risk, origin)` takes an already-classified `ActionRisk`, resolved
  by the new `ToolRegistry.classify` (fail-safe `state_changing` for an unknown tool id).
  `PolicyCheckInput`/`CriticCheckInput` carry every tool call from any source;
  `buildCriticPrompt`/the Navigator's tool listing sanitize a non-browser tool's
  `description` as untrusted content. Also wired `@aegis/security`'s real
  `sanitizePageContent` into the composition root, replacing a pre-existing
  `identitySanitize` no-op that had shipped since Phase 1.
- [0031](docs/adr/0031-mcp-client-streamable-http.md) — MCP client over Streamable HTTP
  (Phase 2, issue #83): `createMcpClient` wraps `@modelcontextprotocol/sdk`'s `Client` +
  `StreamableHTTPClientTransport` (no stdio — a browser extension can't spawn child
  processes); a genuine timeout and the caller's own `AbortSignal` firing share the
  identical SDK error code, distinguished only by message text. `MockMcpServer` is a
  real local HTTP server (the SDK's `McpServer` + `StreamableHTTPServerTransport` bound
  to an ephemeral `127.0.0.1` port), run in stateful mode after stateless mode proved
  broken under this SDK version's Node HTTP bridge.
- [0032](docs/adr/0032-mcp-server-config-storage.md) — MCP server config storage (Phase
  2, issue #84): `McpServerConnectionConfig` is keyed by `url` (mirroring `SitePolicy`'s
  origin key); an auth header stores only a `secretName` reference, never a value.
  `@aegis/mcp` stays a sibling of `@aegis/security` — resolution is an injected
  `SecretResolver` function, not a vault import. `testMcpServerConnection` performs the
  same resolve → connect → list-tools steps a real `ToolRegistry` wiring will.
- [0033](docs/adr/0033-mcp-tools-to-toolregistry.md) — MCP tools → `ToolRegistry` (Phase
  2, issue #85): `registerMcpServerTools` connects, lists tools, and registers each as
  `mcp.<server>.<tool>`; risk is inferred from MCP annotations (`readOnlyHint` → `read`,
  anything else including no annotations → fail-safe `state_changing`); a minimal
  `jsonSchemaToZod` converter (not a general-purpose library) builds `Tool.inputSchema`.
  `@aegis/mcp` takes its first cross-package dependency (`@aegis/actions`). MCP
  elicitation plumbing (`onElicitationRequest`) is wired into `McpClient.connect` but not
  yet routed through a real confirmation UI — that's #90.
- [0034](docs/adr/0034-mcp-tool-permissioning.md) — MCP tool permissioning (Phase 2, issue
  #86): `McpToolPolicy`/`McpToolPolicyStore` (mirroring `SitePolicy`/`PolicyStore`) plus
  `gateMcpTools`, a deny-by-default admission gate `registerMcpServerTools` now runs after
  `listTools()` — a tool never seen before is recorded `deny` (pending) and excluded, an
  explicitly denied tool stays excluded, only an explicitly allowed tool is registered.
  `config.enabled === false` skips connecting entirely (per-server gate). Also fixed a
  latent trace bug found while auditing tool calls: `buildTraceStep` indexed the
  browser-only `proposedActions` against the all-sources `lastRunSummary.toolCalls`,
  which would misalign the moment a batch mixed an MCP call with a browser one (never
  triggered before, since no MCP tool has ever run live) — now correlates against
  `proposedToolCalls` instead, and `TraceStep`/`TraceActionEntry` gain `policyDecision`/
  `toolId`/`source`/`argsSummary` for audit. No live MCP server is wired into the running
  extension yet — deferred to #89, which also builds the UI to review pending tools.
- [0035](docs/adr/0035-webmcp-detection-and-adapter.md) — WebMCP detection + adapter
  (Phase 2, issue #87): targets `document.modelContext` (Chrome 150+'s current attribute
  name). A two-world event bridge (`page-bridge.ts` MAIN-world / `isolated-bridge.ts`
  ISOLATED-world, talking only over `bridge-protocol.ts`'s request/response events on the
  shared `document`) since a live `execute` reference can't cross the MAIN/ISOLATED world
  boundary. `registerWebMcpTools` wraps tools as `web.<name>`, fail-safe risk inference
  (`readOnlyHint` -> `read`, else `state_changing`), and stays synced to the page's live
  tool list via `onToolsChanged`. Real content scripts
  (`webmcp-page-bridge.content.ts`/`webmcp-relay.content.ts`) wire both halves into the
  actual extension; the ISOLATED half tears down via WXT's `ctx.onInvalidated`. Adding
  `@aegis/mcp` as `apps/extension`'s first real dependency surfaced a real bug — both
  content scripts bundled ~215KB each (nearly all of `@modelcontextprotocol/sdk`) because
  `packages/mcp/package.json` had no `sideEffects: false`; fixed, plus moved test-only
  exports to a `@aegis/mcp/testing` subpath — content scripts now ship at ~2-5KB. No live
  wiring into a running task's `ToolRegistry` yet — deferred to #88.
- [0036](docs/adr/0036-webmcp-preferred-action-routing.md) — WebMCP preferred-action
  routing (Phase 2, issue #88): closes the gap #87 left open with a new
  `background/webmcp-tab-bridge.ts` (a per-tab `WebMcpSource` over a `chrome.runtime`
  port, mirroring `isolated-bridge.ts`'s own shape one level up), real relaying from
  `webmcp-relay.content.ts`, and wiring into `buildLoopServices`/`createRunManager` -
  finally making a detected WebMCP tool live in a running task's `ToolRegistry`.
  "Preference" is one new paragraph in `NAVIGATOR_SYSTEM_PROMPT` (tool choice is already
  the Navigator's own job; no separate routing code), and trace savings are a fixed,
  documented estimate (`ESTIMATED_DOM_STEPS_PER_DECLARED_TOOL_CALL = 3`) credited to a
  successful `mcp`/`webmcp` call. A new real E2E spec (two near-identical fixtures,
  `webmcp-shipping.html`/`webmcp-shipping-fallback.html`) proves the tool path completes
  in one `acting` cycle versus the DOM fallback's two, against the real built extension's
  real content scripts and real background relay. The example tool is deliberately
  read-only, since the confirmation UI still can't preview a non-browser tool call
  (`buildConfirmationRequest` stays `Action[]`-only) - that gap is explicitly #90's job.
- [0037](docs/adr/0037-mcp-tools-management-ui.md) — Tools & MCP management UI (Phase 2,
  issue #89): closes the MCP-server composition-root gap #85/#86 deferred -
  `registerConfiguredMcpServers` in `build-loop-services.ts` connects every configured,
  enabled server and registers its allowed tools, tolerating any single server's failure.
  A new options tab (`mcp-tools-panel.tsx`) manages servers, discovers tools via the
  existing `testMcpServerConnection`, sets per-tool allow/deny, and toggles WebMCP
  globally (`createWebMcpSettingsStore`, defaults on). `buildMcpToolId`/`toIdSegment` are
  now exported from `@aegis/mcp` so the UI computes the exact same tool id a live run
  does. Investigating this surfaced a real, pre-existing gap: the background has no way
  to share an _unlocked_ vault with the options page's separate process, so an MCP server
  needing an auth header can't actually connect from a live task yet (a server needing no
  auth is unaffected) - documented, not silently worked around; the same gap already
  existed for `input_text`/`send_keys` secret placeholders, which also have no live-run
  caller today.

## Notes

- Phase A (bootstrap: labels, milestones, issues #1-#35) completed 2026-07-08.
- Phase B (build loop, issues #1-#35) completed 2026-07-09 — all 35 issues implemented,
  gated, and merged.
- Phase C (finalize + tag v0.1.0): see `CHANGELOG.md` and the `v0.1.0` tag.
- Post-release: issue #71 (unambiguous element-ref format) found via the first real-model
  live-mode eval run — see ADR 0024.
- Post-release: issue #73 (filter hidden elements from the DOM pruner) found via a
  follow-up live-model eval re-run after #71 — see ADR 0025.
- Post-release: issue #75 (select existing content before `input_text` inserts) found
  via a follow-up live-model eval re-run after #73 — see ADR 0026.
- Post-release: issue #77 (Navigator overall-task context) found via repeated
  follow-up live-model eval re-runs after #75 — see ADR 0027.
- v0.1.1 (2026-07-10): patch release bundling the four post-release reliability fixes
  above (#71, #73, #75, #77). See `CHANGELOG.md` and the `v0.1.1` tag.
- Phase 2 (tool-use: MCP + WebMCP) kicked off 2026-07-10 per `PHASE_2_PROMPT.md`.
  Milestones M8–M12 and issues #80–#93 created (backlog P2-1…P2-14 map 1:1 to
  #80…#93 in listed order). Work proceeds via the same per-issue loop as Phase 1.
- #80 (unified `Tool`/`ToolRegistry`) merged 2026-07-10 — see ADR 0028.
- #81 (tool-calling in the agent loop) merged 2026-07-10 — see ADR 0029. Supersedes
  ADR 0006 (`navigator/llm-action-schema.ts` deleted).
- #82 (tool risk gating) merged 2026-07-10 — see ADR 0030. Also fixed a pre-existing
  gap discovered while implementing it: the real content sanitizer (`sanitizePageContent`,
  built in #20) was never wired into the composition root — every agent used the
  `identitySanitize` no-op placeholder in production. Now wired for Planner/Navigator/
  Verifier/Critic.
- #83 (MCP client over Streamable HTTP) merged 2026-07-10 — see ADR 0031. First issue
  in M9; `@aegis/mcp` gains a real dependency (`@modelcontextprotocol/sdk`) and its first
  real implementation.
- #84 (MCP server config + storage) merged 2026-07-10 — see ADR 0032.
- #85 (MCP tools → ToolRegistry) merged 2026-07-10 — see ADR 0033. Last issue in M9.
- #86 (MCP permissioning) merged 2026-07-10 — see ADR 0034. Final issue in M9.
- #87 (WebMCP detection + adapter) merged 2026-07-10 — see ADR 0035. First issue in M10;
  `apps/extension` gains its first `@aegis/mcp` dependency and its first content scripts.
- #88 (WebMCP preferred-action routing) merged 2026-07-10 — see ADR 0036. Final issue in
  M10 — a WebMCP tool is now live end-to-end, from page declaration to Navigator call.
- #89 (Tools & MCP management UI) merged 2026-07-10 — see ADR 0037. First issue in M11;
  a configured MCP server is now also live end-to-end, from the options page to a run.

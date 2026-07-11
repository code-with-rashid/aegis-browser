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
- [x] #90 P2-11 Trace + confirmation for tool calls — blocked by: #82

### M12 — Integration & release

- [x] #91 P2-12 E2E: MCP + WebMCP tasks — blocked by: #88, #90
- [x] #92 P2-13 Tool-use evals + security suite — blocked by: #91
- [x] #93 P2-14 Docs + v0.2 — blocked by: #92

### M13 — Workflow model & recording

- [x] #108 P3-1 Workflow data model + storage — blocked by: none
- [x] #109 P3-2 Run recorder — blocked by: #108
- [x] #110 P3-3 Parameterization — blocked by: #109

### M14 — Deterministic execution

- [x] #111 P3-4 Deterministic workflow executor — blocked by: #110
- [x] #112 P3-5 Step verification + result capture — blocked by: #111

### M15 — Self-healing

- [x] #113 P3-6 Failure detection + self-heal — blocked by: #112
- [x] #114 P3-7 Healing safety & review — blocked by: #113

### M16 — Scheduling & background runs

- [x] #115 P3-8 Background run engine — blocked by: #111
- [x] #116 P3-9 Scheduler + triggers — blocked by: #115
- [x] #117 P3-10 Unattended-mode guardrails — blocked by: #116, #114

### M17 — Workflow UX, evals, release

- [x] #118 P3-11 Workflow library UI — blocked by: #112
- [x] #119 P3-12 Workflow builder/editor — blocked by: #118, #117
- [x] #120 P3-13 Workflow evals + security suite — blocked by: #119
- [ ] #121 P3-14 Docs + v0.3 — blocked by: #120

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
- [0038](docs/adr/0038-trace-confirmation-tool-calls.md) — Trace + confirmation for tool
  calls (Phase 2, issue #90): closed the `ConfirmationRequest`/`buildConfirmationRequest`
  `Action[]`-only gap ADR 0033/0036/0037 all flagged — a new `toolCalls:
PendingToolCallPreview[]` field (any source, via `describeToolCall` + `summarizeArgs`,
  moved from `trace.ts` into `confirmation.ts` as the one shared implementation) is what
  the confirmation modal's main view now renders; `actions`/`preview` stay browser-only,
  feeding only the `EDIT` flow (Edit is disabled when nothing in the batch is a browser
  action). `createAgentLoopMachine` gains `toolRegistry`/`sanitize` constructor
  dependencies, the same shape as `executorContext`, since building a tool-call-aware
  preview needs both. `trace-list.tsx` gains a visible source badge and an expandable
  "Show args" (toolId + argsSummary) per action, matching the existing "Show raw
  perception" pattern.
- [0039](docs/adr/0039-e2e-mcp-webmcp-tool-tasks.md) — E2E: MCP + WebMCP tasks (Phase 2,
  issue #91): the WebMCP half was already covered by #88's existing spec; the new work is
  `apps/extension/e2e/mcp-tool-task.spec.ts` against a real `MockMcpServer` — one scenario
  completing a task via a `read`-risk tool with zero page interaction, one proving a
  `state_changing` tool call (no annotations, fail-safe risk inference) genuinely blocks on
  confirmation. Since an MCP tool has no page DOM to check, the "real state, not
  self-reported status" proof (ADR 0020's convention) is the mock server's own call count
  instead — `orderCalls === 0` pre-approval, `=== 1` only after. New `seedMcpServer`
  (`@aegis/eval-harness`) mirrors `seedModelRoutingConfig`'s shape without taking on
  `@aegis/mcp` as a dependency.
- [0040](docs/adr/0040-tool-use-evals-and-security-suite.md) — Tool-use evals + security
  suite (Phase 2, issue #92): `evals/`'s `TASK_SET` gains `webmcp-shipping` (a drop-in) and
  `mcp-tool-task` (via a new generic `EvalTask.setup` hook that starts/tears down a real
  `MockMcpServer`) — found and fixed a real, latent case-sensitivity bug in the reliability
  scorer's summary-substring match while wiring the first one in. A new
  `apps/extension/e2e/hostile-tool-security.spec.ts` proves a malicious tool _description_
  is neutralized in the real, live Navigator prompt (not just a mocked `sanitize` stub),
  and that hostile WebMCP/MCP tools baiting an unauthorized call are blocked by the
  alignment critic before confirmation, mirroring `injected-purchase-attempt`'s
  worst-case-Navigator principle. `injection-fixtures.test.ts` gains matching unit-level
  fixtures for both the guaranteed case (imperative phrasing, neutralized) and the
  documented limitation (plausible-sounding bait, survives by design — the critic is the
  real defense). Confirmed no tool-output-based exfiltration vector exists to test today.
- [0041](docs/adr/0041-v0-2-0-release.md) — v0.2.0 release (Phase 2, issue #93): root
  `README.md` gains an "MCP & WebMCP tools" section grounded in the real options-page UI
  text; `docs/DESIGN.md` gains §16 documenting what Phase 2 actually shipped (and what it
  deliberately didn't — elicitation UI, cross-process vault access); `apps/extension/
README.md` backfills the sections #90-#92 were each missing; `CHANGELOG.md` gains one
  `[0.2.0]` entry covering four real bugs found while building Phase 2; every package
  bumped `0.1.1` → `0.2.0`, mirroring the `v0.1.1` patch release's own bump mechanics.
- [0042](docs/adr/0042-workflow-data-model-storage.md) — Workflow data model + storage
  (Phase 3, issue #108): a new `@aegis/workflows` package (depends only on `@aegis/shared`
  so far) — `Workflow`/`WorkflowStep`/`WorkflowParam`/`RunPolicy` Zod schemas,
  locally-branded `WorkflowId`/`WorkflowStepId` (a step gets a stable id not in the
  original sketch, justified by #113/#119's later need to name one exact step), a real
  but currently-empty migration mechanism (tested against synthetic fixtures, no invented
  domain migrations), and `WorkflowStore` (create/get/update/remove/list, one storage key
  holding a map keyed by id, mirroring `@aegis/mcp`'s `McpServerStore`).
- [0043](docs/adr/0043-run-recorder.md) — Run recorder (Phase 3, issue #109):
  `buildWorkflowSteps`/`createRunRecorder` capture a successful run's steps, mirroring
  `buildTraceStep`'s by-index correlation of `lastRunSummary.toolCalls` with
  `proposedToolCalls`. New `deriveSelector` (a real, previously-unused `DOM.describeNode`
  CDP call) builds a best-effort resilient selector; `WorkflowTarget.selector` is revised
  to optional since deriving one can genuinely fail. `targetRefOf` moved from a private
  duplicate in `policy-service.ts` into `@aegis/actions`, used by both callers now.
- [0044](docs/adr/0044-workflow-parameterization.md) — Workflow parameterization (Phase 3,
  issue #110): a `‹param:name›` placeholder, byte-for-byte the same delimiter convention
  as `@aegis/security`'s `‹secret:name›`; a generic `mapStringsDeep` walker (since
  `resolveActionSecrets` is hardcoded to known `Action` fields, unusable for arbitrary
  `WorkflowStep.args`). `parameterizeSecret` never stores the literal it removes;
  `resolveWorkflowParams` never touches a `SecretVault` — a secret-kind param resolves to
  another placeholder (`‹secret:name›`), with the real vault lookup deferred to the
  existing `resolveActionSecrets` pipeline. `validateWorkflowParams` catches drift in both
  directions (undeclared placeholder, duplicate param name) without requiring every
  declared param to already be referenced.
- [0045](docs/adr/0045-deterministic-workflow-executor.md) — Deterministic workflow
  executor (Phase 3, issue #111): `runWorkflow` binds params (#110) then replays steps
  with zero LLM calls, straight through `ToolRegistry.call` (not `ActionRunner` — a
  replay's failure mode is "the page changed," which retrying can't fix). New
  `resolveStepTarget` tries the recorded `ref` first, then falls back to the resilient
  `selector` (#109) via new `DOM.getDocument`/`DOM.querySelector`/`DOM.describeNode` CDP
  calls, substituting a freshly-resolved ref via a new `withTargetRef` (`@aegis/actions`,
  symmetric with #109's `targetRefOf`). A target that can't be resolved fails the run
  outright — self-healing that is explicitly #113's job, not this issue's.
- [0046](docs/adr/0046-step-verification-result-capture.md) — Step verification & result
  capture (Phase 3, issue #112): `executeWorkflow` now evaluates a step's `expect`
  `PostCondition` after a successful tool call via new `evaluatePostCondition`
  (`element_visible`/`element_hidden` via `getComputedStyle`+`getClientRects()`,
  `url_matches`/`text_contains` via the codebase's first `Runtime.evaluate` calls).
  `WorkflowStepResult` gains `output?: unknown` (the tool call's own result value,
  captured regardless of a later `expect` failure). Every `failed` `WorkflowRunOutcome`
  now carries a typed `NeedsHealingSignal` (`target_not_found` /
  `tool_call_failed` / `post_condition_failed`) — detected and reported here; acting on
  it is #113's job.
- [0047](docs/adr/0047-failure-detection-self-heal.md) — Failure detection & self-heal
  (Phase 3, issue #113): new `healStep` reuses the live agent loop's `NavigatorService`
  (`@aegis/agent`) to propose a fix for one broken step against a fresh
  `getPerceptionPayload` read, executes only its first proposed tool call, and re-checks
  the step's `expect` if declared. New `runWorkflowWithHealing` runs `executeWorkflow`
  (#111) normally and, on a failed step, calls `healStep`; a successful fix is patched
  into the persisted workflow via the existing `WorkflowStore.updateWorkflow` (bumping
  `version`) before continuing the remaining steps. Gives up — original `failed` outcome,
  workflow untouched — the moment one heal attempt doesn't succeed. Deliberately no risk/
  confirmation gate in front of executing the fix yet — that's #114's job.
- [0048](docs/adr/0048-healing-safety-review.md) — Healing safety & review (Phase 3, issue
  #114): `healStep` now classifies a proposed fix's risk (`ToolRegistry.classify`, the
  same `elementNameFor`-style signal `apps/extension`'s live policy service already uses)
  and gates it via new `gateHeal` _before_ ever calling the tool. A state-changing fix
  needs confirmation when attended, hard-stops when unattended; a fix outside the
  workflow's `RunPolicy.allowedToolIds` hard-stops unattended regardless of risk.
  `RunPolicy.allowStateChanging` never overrides this — it pre-authorizes the step as
  _recorded_, not an LLM-improvised fix. New `HealOutcome` kinds `needs_confirmation`
  (carries a `HealDiff` + `PendingHeal`, resumed via `applyConfirmedHeal`) and
  `hard_stopped`; `runWorkflowWithHealing`'s outcome widens to `HealingRunOutcome` without
  touching #111's own `WorkflowRunOutcome`. New `rollbackHealedStep` reverts one step back
  to a prior snapshot via the existing `WorkflowStore.updateWorkflow`.
- [0049](docs/adr/0049-background-run-engine.md) — Background run engine (Phase 3, issue
  #115): a managed tab is a real, non-active `chrome.tabs` tab (`background/managed-tab.ts`),
  not `chrome.offscreen` — an offscreen document can't navigate to a third-party origin or
  be `chrome.debugger`-attached. New `runWorkflowInBackground` drives steps one at a time,
  persisting a `WorkflowRunRecord` (new `WorkflowRunStore`) after every step so a
  service-worker eviction loses at most the one step in flight; a resumed call picks up
  from `nextStepIndex`. Always heals `mode: 'unattended'`. New
  `createBackgroundRunManager` (`apps/extension`) reuses `buildLoopServices` completely
  unchanged — its `services.decide` already is the real `NavigatorService` the background
  engine needs. Concurrency capped by a plain in-memory `RunConcurrencyLimiter`, not
  persisted. No new messaging protocol — `startBackgroundRun` is a plain function; #116
  (scheduler) is what will actually call it.
- [0050](docs/adr/0050-scheduler-triggers.md) — Scheduler + triggers (Phase 3, issue #116):
  new `WorkflowScheduleStore` persists at most one `WorkflowSchedule` per workflow
  (`interval` or `daily` trigger — deliberately not a cron grammar, since `chrome.alarms`
  itself only fires on a period or a specific time). New `isScheduleDue`/
  `findDueSchedules` are pure functions of the schedule and the clock; a `daily` trigger
  never fires for a "missed" occurrence from before the schedule existed. One recurring
  `chrome.alarms` alarm (1-minute period, new `"alarms"` permission) drives
  `apps/extension`'s new `Scheduler.checkSchedules`, which starts a background run
  (#115) for each due schedule; `Scheduler.triggerNow` is the manual-trigger entry point.
  `WorkflowRunStore` gains `listRunsForWorkflow` for per-workflow run history.
- [0051](docs/adr/0051-unattended-mode-guardrails.md) — Unattended-mode guardrails (Phase
  3, issue #117): new `gateOriginalStep`/`gateWorkflowOrigin` enforce a workflow's
  `RunPolicy` against its _recorded_ steps before an unattended run executes them —
  distinct from `gateHeal` (#114), since a recorded, `allowStateChanging`-authorized
  state-changing step is allowed to replay unattended while a healed fix never is. New
  `exceedsMaxSteps`/`hasReachedDailyRunLimit` enforce `maxStepsPerRun`/`maxRunsPerDay`
  (present in the schema since #108, never enforced until now). New
  `resolveStepArgsSecrets` resolves `‹secret:name›` placeholders in any step's args via
  the vault before executing — discovered along the way that `@aegis/security`'s
  pre-existing `resolveActionSecrets` was never actually called from any real execution
  path anywhere in the codebase; an unresolvable secret hard-stops the run rather than
  ever leaking the raw placeholder. `apps/extension` gains a real `chrome.notifications`
  call on any hard-stop (new `"notifications"` permission).
- [0052](docs/adr/0052-workflow-library-ui.md) — Workflow library UI (Phase 3, issue #118):
  new options-page "Workflows" tab lists saved workflows, letting a user run one with its
  own parameter values, view its run history (via a new sibling `WorkflowRunTrace`, since
  a deterministic replay's `WorkflowStepResult` shares no shape with the side panel's
  `TraceList`), edit its name/param defaults, and delete it. Starting a run is the first
  thing the options page has ever needed the background service worker for, so it gets its
  own `requestId`-correlated message-port channel (`WORKFLOW_BRIDGE_PORT_NAME`), separate
  from the side panel's; the background side just forwards to `scheduler.triggerNow`
  (#116). Editing recorded `steps` themselves is out of scope — that's #119's job.
- [0053](docs/adr/0053-workflow-builder-editor.md) — Workflow builder/editor (Phase 3,
  issue #119): new `WorkflowBuilderPanel` supersedes #118's inline "name + param defaults
  only" editor — a full-page swap letting a user view/reorder/delete recorded steps
  (content stays read-only), add/remove/edit params of either kind, edit the `RunPolicy`,
  and enable/configure scheduling. Every capability already existed in `@aegis/workflows`
  (`WorkflowStore.updateWorkflow`'s `WorkflowPatch`, `WorkflowScheduleStore.upsertSchedule`)
  — this issue is UI-only, no domain-package changes. "Version history" shows `version`/
  `updatedAt`, the level the data model actually supports; a real snapshot timeline is
  future work.
- [0054](docs/adr/0054-workflow-evals-security-suite.md) — Workflow evals + security suite
  (Phase 3, issue #120): a new, parallel eval path (`evals/src/workflow-runner.ts`) proves
  deterministic replay and self-heal across a simulated site change end-to-end — clean
  replay completes with zero model calls, a healed replay (the recorded button's id
  changed but not its accessible name) completes via a small, bounded number of Navigator-
  only calls, both triggered through the real options-page "Run" action and observed by
  polling `chrome.storage.local` directly. A new Playwright E2E spec,
  `apps/extension/e2e/workflow-unattended-security.spec.ts`, proves an injected page
  instruction can't cause an unauthorized state change during a background self-heal
  (`gateHeal` hard-stops it regardless) and that an out-of-allow-list step never executes
  even when its target genuinely exists. Along the way, discovered (and deliberately left
  unfixed, out of scope) a pre-existing `packages/agent` gap: an element's accessible
  `name` is never sanitized in the Navigator's prompt, only free-text page content and
  tool descriptions are.

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
- #90 (trace + confirmation for tool calls) merged 2026-07-10 — see ADR 0038. Final issue
  in M11 — a `state_changing` MCP/WebMCP call now gets a real confirmation preview.
- #91 (E2E: MCP + WebMCP tasks) merged 2026-07-10 — see ADR 0039. First issue in M12; the
  WebMCP half was already covered by #88's spec, so the new work is a real-MCP-server E2E.
- #92 (tool-use evals + security suite) merged 2026-07-10 — see ADR 0040. `pnpm eval`
  gains tool-use coverage; the security suite gains a hostile-tool corpus.
- #93 (docs + v0.2.0 release) — this issue: MCP/WebMCP setup documented in the root
  README and `docs/DESIGN.md` §16; every package bumped to `0.2.0`; `CHANGELOG.md` gains
  a `[0.2.0]` entry. Final issue in M12 — every Phase 2 issue (#80–#93) closed.
- v0.2.0 (2026-07-10): Phase 2 release. See `CHANGELOG.md` and the `v0.2.0` tag.
- Phase 3 (workflows & autonomy: record → compile → run, self-heal, scheduling) kicked
  off 2026-07-11 per `PHASE_3_PROMPT.md`. Milestones M13–M17 and issues #108–#121 created
  (backlog P3-1…P3-14 map 1:1 to #108…#121 in listed order). Work proceeds via the same
  per-issue loop as Phases 1 and 2.
- #108 (workflow data model + storage) merged 2026-07-11 — see ADR 0042. First issue in
  M13; `@aegis/workflows` exists as a real package with zero consumers yet, as expected.
- #109 (run recorder) merged 2026-07-11 — see ADR 0043. `@aegis/workflows` gains its
  first cross-package dependencies (`agent`/`actions`/`perception`); still no consumer in
  `apps/extension` yet — that's a later issue's UI wiring, not this one's scope.
- #110 (parameterization) merged 2026-07-11 — see ADR 0044. `@aegis/workflows` gains its
  first dependency on `@aegis/security` (for `toSecretPlaceholder` only — no `SecretVault`
  dependency anywhere in this package).
- #111 (deterministic workflow executor) merged 2026-07-11 — see ADR 0045. Final issue
  in M14 — a recorded workflow now genuinely replays end-to-end with zero LLM calls.
- #112 (step verification + result capture) merged 2026-07-11 — see ADR 0046. Final
  issue in M14; a step's `succeeded` flag now means the tool ran _and_ its declared
  `expect` verified, not just "the tool call didn't error." Next up, M15 (#113/#114) is
  self-healing.
- #113 (failure detection + self-heal) merged 2026-07-11 — see ADR 0047. First issue in
  M15; `runWorkflowWithHealing` can now recover a step whose target shifted by asking the
  live agent loop's own Navigator for a fix, tested end to end with a `MockProvider` and a
  mutated selector fixture. No safety gate on the fix yet — that's #114.
- #114 (healing safety & review) merged 2026-07-11 — see ADR 0048. Final issue in M15; a
  state-changing heal now needs confirmation (attended) or hard-stops (unattended) before
  it ever executes, with a diff and a rollback primitive. Next up, M16 (#115/#116/#117) is
  scheduling and background runs.
- #115 (background run engine) merged 2026-07-11 — see ADR 0049. First issue in M16; a
  workflow can now run to completion on a managed (non-active) tab with no side panel
  open, checkpointing progress per step so it survives a simulated service-worker
  restart — tested by resuming a fresh `WorkflowRunStore`/`BackgroundRunManager` instance
  over the same storage after an interruption. `apps/extension` now depends on
  `@aegis/workflows` for the first time.
- #116 (scheduler + triggers) merged 2026-07-11 — see ADR 0050. `chrome.alarms`-based
  scheduling (`interval`/`daily`), a manual trigger, and per-workflow enable/disable are
  all in place; a scheduled workflow now fires via a 1-minute polling alarm and records a
  run whose history is visible via the new `listRunsForWorkflow`.
- #117 (unattended-mode guardrails) merged 2026-07-11 — see ADR 0051. Final issue in M16;
  a workflow's own `RunPolicy` now actually bounds its _recorded_ steps unattended (not
  just healed ones, #114), `maxStepsPerRun`/`maxRunsPerDay` are enforced for the first
  time since the schema defined them in #108, secrets resolve via the vault before a step
  executes (or the run safely hard-stops rather than leaking a placeholder), and a
  blocked run notifies the user via `chrome.notifications`. Next up, M17 (#118-#121) is
  workflow UX, evals, and the v0.3 release.
- #118 (workflow library UI) merged 2026-07-11 — see ADR 0052. First issue in M17; the
  options page's new "Workflows" tab is the first UI over any of `@aegis/workflows`'
  stores — list, run-on-demand with per-run param values, run history with a full
  step-by-step trace, edit name/param defaults, and delete. Also the first time the
  options page has ever needed to reach the background service worker (a new, separate
  message-port channel just for triggering a run). Next up, #119 (workflow builder/editor)
  is the recorded-`steps` editor this issue deliberately left out of scope.
- #119 (workflow builder/editor) merged 2026-07-11 — see ADR 0053. New `WorkflowBuilderPanel`
  supersedes #118's stopgap inline editor: view/reorder/delete steps, full param add/
  remove/edit (either kind), an editable `RunPolicy` form, and a schedule form wired to
  `WorkflowScheduleStore`. Confirmed every capability needed already existed in
  `@aegis/workflows` since #108-#116 — purely a UI issue, no domain-package changes. Next
  up, #120 (workflow evals + security suite) is the last issue before docs + the v0.3 tag.
- #120 (workflow evals + security suite) merged 2026-07-11 — see ADR 0054. Final issue in
  M17 before docs + release; `pnpm eval` now proves self-heal end-to-end (clean replay: 0
  model calls; healed replay after a simulated site change: completes via 1-2 Navigator-
  only calls), and a new E2E spec proves an unattended background run can't be hijacked
  into an unauthorized state change by injected page content or a step outside its
  RunPolicy allow-list. Surfaced (and deliberately left open) a pre-existing
  `packages/agent` gap: an element's accessible name is never sanitized in the Navigator's
  prompt. Next up, #121 (docs + v0.3) is the last issue in Phase 3.

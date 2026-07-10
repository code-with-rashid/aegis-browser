# @aegis/extension

The WXT (Manifest V3) app. This is the composition root: it wires the domain packages
(`@aegis/agent`, `@aegis/security`, `@aegis/actions`, `@aegis/perception`, `@aegis/llm`,
`@aegis/shared`) to `chrome.*` APIs and hosts the UI.

- `entrypoints/background.ts` — service worker; owns the CDP session and agent loop via
  `background/run-manager.ts`.
- `entrypoints/sidepanel/` — React side panel (chat input, run controls, live status,
  action trace, confirmation gate).
- `entrypoints/options/` — React options page (BYOK provider config per agent role).
- `messaging/` — the typed `chrome.runtime.connect` bridge between them.
- `background/` — the real, non-mock `LoopServices` composition (see ADR 0013).

Styling is Tailwind CSS + shadcn/ui (components vendored under `components/ui/`, shared
class-merge helper in `lib/utils.ts`).

## Side panel shell & messaging bridge (#25)

See [ADR 0013](../../docs/adr/0013-side-panel-composition-root.md) for the full design.
Summary:

- `messaging/protocol.ts` defines `PanelToBackgroundMessage`
  (`START_RUN`/`STOP_RUN`/`PAUSE_RUN`/`RESUME_RUN`/`APPROVE_RUN`/`REJECT_RUN`/`EDIT_RUN`)
  and `BackgroundToPanelMessage`
  (`RUN_IDLE`/`RUN_STATUS`/`RUN_START_FAILED`/`TRACE_SNAPSHOT`/`TRACE_STEP`) over one
  named port (`RUN_BRIDGE_PORT_NAME`). `messaging/port.ts`'s `MessagePort<TSend, TReceive>`
  is the transport-agnostic shape both `chrome-port.ts` (the real `chrome.runtime.connect`
  adapter) and `fake-port.ts` (an in-memory connected pair, for tests) implement.
- `entrypoints/sidepanel/run-store.ts`'s `createRunStore(port)` is a Zustand store built
  from an injected port — `entrypoints/sidepanel/store.ts` wires the real one in; tests
  use `createFakePortPair`. `App.tsx` reads/drives it: a task textarea, Start (or
  Stop/Pause/Resume depending on status), a status panel (step/replan counts, task
  summary, last error), the action trace, and the confirmation gate modal.
- `background/run-manager.ts`'s `RunManager` owns the single active run, broadcasts
  `RUN_STATUS` to every connected panel on each transition, persists the snapshot to
  `chrome.storage.session` after every transition, and resumes an ongoing (not just
  terminal) snapshot on startup (`initialize()`) — a paused run survives a service-worker
  restart, not just an actively-running one.
- `background/build-loop-services.ts` + `background/policy-service.ts` assemble the real
  `LoopServices`/`ExecutorContext` pair — every port is a genuine adapter
  (`createChromeCdpSession`, `createActionRunner`, `ProviderRegistry` + `ModelRouter`, a
  new `PolicyEngine`-backed `PolicyService`), not a stub. Starting a run before any
  provider is configured (see the options page, #28 below) fails with a real,
  user-surfaced `MODEL_ROUTING_NOT_CONFIGURED` reason.

## Action trace / log UI (#26)

See [ADR 0014](../../docs/adr/0014-action-trace-log-ui.md). `run-manager.ts` watches for
the `verifying -> (anything else)` transition edge and calls `@aegis/agent`'s
`buildTraceStep` right then, accumulating a `TraceStep[]` it persists to
`chrome.storage.session` and broadcasts incrementally: `TRACE_SNAPSHOT` (the full array,
reset to `[]` on every new `START_RUN`, sent to every port on connect) and `TRACE_STEP`
(one new entry, as each completes). The Zustand store's `trace` field and
`entrypoints/sidepanel/trace-list.tsx`'s `TraceList` component don't distinguish "live"
from "replay" — they just render whatever the array currently holds, whether the run is
still going or already finished. Each step is expandable to show its raw perception.

## Confirmation gate UI (#27)

See [ADR 0015](../../docs/adr/0015-confirmation-gate-ui.md). `LoopRunSummary` (in
`@aegis/agent`) gained an optional `pendingConfirmation`, so it rides along the
already-existing `RUN_STATUS` broadcast with no new background-to-panel message needed.
`APPROVE_RUN`/`REJECT_RUN`/`EDIT_RUN` are the three new panel-to-background messages,
handled in `run-manager.ts` by forwarding to `@aegis/agent`'s existing `approveLoop`/
`rejectLoop`/`editLoop`.

`entrypoints/sidepanel/confirmation-modal.tsx`'s `ConfirmationModal` renders whenever
`pendingConfirmation` is set: a native `<dialog>` with `showModal()` (real focus trap and
inert background, no custom a11y code), Escape treated as an explicit Reject (never a
silent dismiss — the loop would otherwise stay stuck in `confirming` with no decision
ever sent), and initial focus on Reject rather than Approve. "Edit" only offers editable
free-text fields for `input_text`/`send_keys` actions ("Save changes" sends `EDIT_RUN`
and returns to view mode — the human still has to click Approve afterward).

## Options — models & keys (#28)

See [ADR 0016](../../docs/adr/0016-options-models-and-keys.md). `entrypoints/options/`
(opens in its own tab — a `<meta name="manifest.open_in_tab" content="true">` tag in
`index.html`, WXT's per-entrypoint convention) is the BYOK configuration screen: one
`ProviderConfigForm` per agent role (planner/navigator/verifier/critic), each with a
provider-kind selector and kind-specific fields (API key masked behind a Show/Hide
toggle, model, base URL where relevant).

- `provider-draft.ts` holds the pure `ProviderDraft` <-> `ProviderConfig` conversion
  (`toProviderConfig` re-validates through the existing `ProviderConfigSchema` on every
  change; `draftFromConfig` flattens a saved config back into editable strings).
- `test-connection.ts`'s `testProviderConnection` makes one real, minimal `generateText`
  call through an injectable `ProviderFactory` (defaults to a real `ProviderRegistry`) —
  runs directly from the options page, relying on the same `host_permissions: ['<all_urls>']`
  CORS bypass already granted for CDP/tab access, no background round-trip needed.
- `App.tsx` loads any previously-saved `ModelRoutingConfig` via `@aegis/llm`'s
  `loadModelRoutingConfig`/`saveModelRoutingConfig` against
  `createChromeStorageAdapter(chrome.storage.local)`, and only enables Save once every
  role's draft parses to a valid `ProviderConfig` — a half-filled draft can never
  overwrite a working saved config.

## Options — permissions panel (#29)

See [ADR 0017](../../docs/adr/0017-options-permissions-panel.md). `App.tsx` is now
tabbed — "Models & Keys" (`models-and-keys-panel.tsx`, #28's original content, now taking
its `StoragePort` as a prop) and "Permissions" (`permissions-panel.tsx`).

- `PermissionsPanel` lists every configured `@aegis/security` `SitePolicy` (per-origin
  `mode: ask/allow/deny` + `allowStateChanging`), each row auto-saving on change via an
  injected `PolicyStore` — no page-level Save button, since each origin's policy is
  independent. An "Add a site policy" form normalizes free-text input to a canonical
  origin (`site-policy-draft.ts`'s `normalizeOrigin`, `new URL(input).origin`) before
  validating it through the existing `SitePolicySchema`.
- The hard deny-list (`DEFAULT_DENY_LIST_HOST_SUFFIXES`, from #21) is rendered read-only
  — scope is "view," not edit; a user can still override one exact origin by setting its
  own policy to `allow`.
- Because `createPolicyStore` re-reads its backing storage on every call (no cache),
  edits here take effect on the very next policy check `background/policy-service.ts`
  makes — no extra wiring needed to satisfy "edits change gate behavior at runtime."

## Options — secret vault UI (#30)

See [ADR 0018](../../docs/adr/0018-options-secret-vault-ui.md). A third options tab,
"Secrets" (`secret-vault-panel.tsx`), takes an injected `@aegis/security` `SecretVault`
(#24). Locked by default on every page load; unlocking with a passphrase either opens the
existing vault or bootstraps a new one. Once unlocked: add a named secret (value masked
behind a Show/Hide toggle, same convention as #28's API key field), remove one, or Lock
again.

- Each stored secret shows its exact `‹secret:name›` placeholder token (`toSecretPlaceholder`)
  with a Copy button — the concrete "where used" affordance: that token is what a user
  types into a task, and it's the only thing the agent ever sees in place of the real
  value.
- Secret names are restricted to `[a-zA-Z0-9_-]+` (`secret-name.ts`) so the placeholder
  token is unambiguous to retype/re-paste — no whitespace or delimiter characters.
- No "reveal" for an existing secret's value; re-adding an existing name overwrites it
  (the vault's `setSecret` is already an upsert).

## Options — Tools & MCP panel (#89)

See [ADR 0037](../../docs/adr/0037-mcp-tools-management-ui.md). A fourth options tab,
"Tools & MCP" (`mcp-tools-panel.tsx`), takes injected `@aegis/mcp` `McpServerStore`/
`McpToolPolicyStore`/`WebMcpSettingsStore` plus a `SecretResolver` (the options page's own
`SecretVault`, `(name) => secretVault.getSecret(name)`).

- Add/enable/disable/remove an MCP server (`mcp-server-draft.ts`'s `toMcpServerConfig`
  validates the form, same shape as `site-policy-draft.ts`) — the enabled checkbox
  auto-saves on change, same convention as the Permissions panel.
- "Discover tools" calls `testMcpServerConnection` (already built for #84's connection
  test) and renders each returned tool's name, description, JSON input schema, and
  inferred risk. Its per-tool permission `<select>` (`buildMcpToolId` computes the exact
  id `registerMcpServerTools` uses internally) reads/writes the same `McpToolPolicyStore`
  record a live run consults — a tool with no stored policy shows "Pending review,"
  matching #86's deny-by-default gate.
- A single checkbox toggles WebMCP globally (`WebMcpSettingsStore`, defaults on) —
  `buildLoopServices` checks it before ever registering a page's declared tools.
- Because every store here re-reads its backing storage on every call (no cache, same as
  `PolicyStore`), changes take effect on the very next task start — no reload needed.

`background/build-loop-services.ts` closes the composition-root gap #85/#86 deferred:
`registerConfiguredMcpServers` connects every configured, enabled server and registers
its allowed tools, tolerating any single server's failure without blocking another or
task start. A server needing an auth header can't actually connect from a live task yet
— the background has no way to share an _unlocked_ vault with the options page's separate
process — a real, documented limitation, not silently worked around (ADR 0037).

## E2E: read-only use cases (#31)

See [ADR 0019](../../docs/adr/0019-e2e-read-only-use-cases.md). `e2e/` runs the real
`.output/chrome-mv3` build, unpacked into a real headed Chromium window, against three
local fixture pages (`e2e/fixtures/`) — "research & extract," "compare & summarize,"
"authenticated read" — proving the full composition root end-to-end: `RunManager` →
`buildLoopServices` → the real XState loop, real CDP perception, real CDP action
executors.

- The shared harness (extension launcher, fake local model server, static fixture
  server, storage seeding, ref-extraction, and every fixture/scenario script) lives in
  `packages/eval-harness` — also used by `evals/`'s reliability runner (#33), so the
  exact same scenario definitions drive both CI correctness and reliability scoring.
  Each scenario scripts its planner/navigator/verifier responses; `findRef` extracts
  real element refs straight out of the actual prompt text sent to the server, never
  hardcoding one.
- Every scenario only proposes `read`/`input`-risk actions with element names chosen to
  avoid `STATE_CHANGING_KEYWORDS` — genuinely read-only, no confirmation-gate interaction
  (that's #32).
- Run locally: `pnpm build && pnpm e2e` (headed; needs a real display). CI runs it as a
  separate `e2e` job under `xvfb-run` on `ubuntu-latest`, apart from the four core gates.

## E2E: confirmation-gated task (#32)

See [ADR 0020](../../docs/adr/0020-e2e-confirmation-gated-task.md). Closes the gap ADR
0019 found: `background/policy-service.ts` now resolves each action's target element name
from perception and passes it as `ActionRiskContext` to `PolicyEngine.evaluate`, so a
`click` on a "Buy Now"-named button genuinely elevates to `state_changing` risk and pauses
the loop in `confirming` — the only path in this codebase from an ordinary action to a
required human confirmation.

`e2e/confirmation-gated-task.spec.ts` (fixture + scenario in `packages/eval-harness`)
proves the safety path: the confirmation dialog appears with the pending click previewed,
the fixture's own `#purchased` element stays hidden while it's showing (the click
genuinely hasn't run), Reject drives a real `confirming -> replanning -> planning`
transition (asserted via the visible "Replans: 1" counter, not just "the run finished
somehow"), and `#purchased` is still hidden after the run reaches `done` — an
unauthorized submit is not just unreported, it never happened.

## Security test suite (#34)

See [ADR 0022](../../docs/adr/0022-security-test-suite.md). `e2e/security-injection.spec.ts`
(fixtures + scenarios in `packages/eval-harness`) proves "zero unauthorized state change"
against indirect prompt injection at the system level: each fixture (`injected-purchase.html`,
`injected-navigate.html`) contains a hidden `SYSTEM: New instructions: ...` line, and the
Navigator is deliberately scripted to _fall for it_ — the worst case, not the case where
the model resists the injection. One test proves the Alignment Critic catches an induced,
task-unrelated "Buy Now" click before the human is ever asked; the other proves a
`navigate`/`open_tab` action induced toward a hard-deny-listed origin is blocked outright
via the destination-origin policy check this issue's investigation found and fixed
(`background/policy-service.ts`'s `originToCheck` — a `navigate` action used to be
policy-checked against the _current_ page's origin, never where it was actually headed).
Content-layer corpus tests (`packages/security/src/sanitize/injection-fixtures.test.ts`)
cover the "hidden instructions" category directly, and document — rather than falsely
assert — that spoofed-CAPTCHA/malicious-URL bait survives text sanitization by design,
since it's linguistically indistinguishable from legitimate copy; the structural defenses
above are what actually stop it.

## WebMCP bridge (Phase 2, #87/#88)

`entrypoints/webmcp-page-bridge.content.ts` (`world: "MAIN"`) and
`entrypoints/webmcp-relay.content.ts` (default ISOLATED world) install the two halves of
`@aegis/mcp`'s WebMCP bridge (`docs/adr/0035-webmcp-detection-and-adapter.md`) into every
page — the MAIN-world script is the only code with real access to a page's own
`document.modelContext`; the ISOLATED-world script relays its tool list and call requests
to the background over a new per-tab port (`messaging/webmcp-protocol.ts`,
`WEBMCP_TAB_PORT_NAME`), since it has real `chrome.*` access instead.

`background/webmcp-tab-bridge.ts`'s `createWebMcpTabBridge()` is the background's end of
that port: a per-tab `WebMcpSource` (`@aegis/mcp`) backed by whatever the connected
content script has reported, with the same bounded-wait-for-a-first-snapshot and
resync-via-`onToolsChanged` shape `isolated-bridge.ts` itself already uses, one level up.
`entrypoints/background.ts` wires `listenForWebMcpTabConnections` to it and passes
`webMcpTabBridge.getSource` into `createRunManager`, which threads it into
`buildLoopServices` — so a task started on a tab whose page already declared WebMCP tools
sees them, live, in that run's `ToolRegistry` from the first `deciding` step
(`docs/adr/0036-webmcp-preferred-action-routing.md`). A tab with no connected bridge (no
content script yet, or WebMCP genuinely absent on that page) fails safe to "no tools" —
never blocks or fails task start.

## Tool-call-aware trace + confirmation (#90)

See [ADR 0038](../../docs/adr/0038-trace-confirmation-tool-calls.md). Before this, a
`state_changing` MCP/WebMCP tool call had no confirmation preview at all —
`buildConfirmationRequest` only ever knew about browser `Action`s.

- `ConfirmationRequest` gains `toolCalls` (every pending call, any source, each described
  via `describeToolCall`/`summarizeArgs`) — this is what `confirmation-modal.tsx`'s main
  view renders; the existing `actions`/`preview` fields stay browser-only, feeding only
  the "Edit" flow (disabled when nothing in the batch is a browser action).
- `trace-list.tsx` gains a visible source badge (`mcp`/`webmcp`, distinct from a plain
  browser action) and an expandable "Show args" revealing the tool id + args summary, per
  action — previously that detail existed in `TraceActionEntry` but was never rendered.

## E2E: MCP + WebMCP tool tasks (#91)

See [ADR 0039](../../docs/adr/0039-e2e-mcp-webmcp-tool-tasks.md). `e2e/mcp-tool-task.spec.ts`
drives the real built extension against a real `MockMcpServer` (`@aegis/mcp/testing`) over
genuine Streamable HTTP: one scenario completes a task via a `read`-risk tool with zero
page interaction, one proves a `state_changing` tool call genuinely blocks on confirmation
before it runs — since an MCP tool has no page DOM to check, the proof is the mock
server's own call count staying zero until Approve. The WebMCP half of this issue's scope
was already covered by the existing `webmcp-preferred-routing.spec.ts` (#88).

## Tool-use evals + hostile-tool security suite (#92)

See [ADR 0040](../../docs/adr/0040-tool-use-evals-and-security-suite.md).
`evals/`'s `TASK_SET` gained `webmcp-shipping` and `mcp-tool-task` (reusing #88/#91's own
scenarios, so reliability measurement can never silently drift from what CI proves
correct). `e2e/hostile-tool-security.spec.ts` extends the #34 security suite to
tool-declared attacks: a malicious tool _description_ is proven neutralized in the real,
live Navigator prompt (not just a mocked `sanitize` stub); a hostile WebMCP tool and a
hostile MCP tool, each baiting an unauthorized call via their own description, are proven
blocked by the alignment critic before confirmation — mirroring
`injected-purchase-attempt.ts`'s worst-case-Navigator principle, just sourced from a
tool's own description instead of page content.

## Commands

```bash
pnpm dev      # wxt dev server (Chrome)
pnpm build    # production build to .output/chrome-mv3
pnpm build:edge
pnpm test     # vitest — messaging, store, and composition-root logic (no chrome.* needed);
              # confirmation-modal.test.tsx opts into a jsdom environment for DOM rendering
pnpm e2e      # Playwright — the real built extension against local fixture pages
              # (read-only/confirmation/security/MCP/WebMCP scenarios, #31-#92)
```

## Note on `chrome.debugger`

Perception and action execution (from M2/M3 onward) use `chrome.debugger` (CDP) to read
and act on the page. Chrome shows an "Aegis is debugging this browser" banner while
attached — this is expected browser behavior for any extension using the Debugger API
and cannot be suppressed; see `docs/DESIGN.md` for why this tradeoff was accepted over
manual DOM scripting.

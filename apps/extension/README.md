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

## E2E: read-only use cases (#31)

See [ADR 0019](../../docs/adr/0019-e2e-read-only-use-cases.md). `e2e/` runs the real
`.output/chrome-mv3` build, unpacked into a real headed Chromium window, against three
local fixture pages (`e2e/fixtures/`) — "research & extract," "compare & summarize,"
"authenticated read" — proving the full composition root end-to-end: `RunManager` →
`buildLoopServices` → the real XState loop, real CDP perception, real CDP action
executors.

- `e2e/fake-model-server.ts` is the "mock/local model": a tiny local HTTP server
  implementing just enough of the OpenAI chat-completions wire format for
  `@ai-sdk/openai-compatible` to parse, seeded into `ModelRoutingConfig` via
  `e2e/seed-storage.ts`. Each scenario (`e2e/scenarios/*.ts`) scripts its planner/
  navigator/verifier responses; `e2e/find-ref.ts` extracts real element refs straight out
  of the actual prompt text sent to the server, never hardcoding one.
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

`e2e/confirmation-gated-task.spec.ts` (`e2e/fixtures/checkout.html`,
`e2e/scenarios/form-fill-confirmation.ts`) proves the safety path: the confirmation dialog
appears with the pending click previewed, the fixture's own `#purchased` element stays
hidden while it's showing (the click genuinely hasn't run), Reject drives a real
`confirming -> replanning -> planning` transition (asserted via the visible "Replans: 1"
counter, not just "the run finished somehow"), and `#purchased` is still hidden after the
run reaches `done` — an unauthorized submit is not just unreported, it never happened.

## Commands

```bash
pnpm dev      # wxt dev server (Chrome)
pnpm build    # production build to .output/chrome-mv3
pnpm build:edge
pnpm test     # vitest — messaging, store, and composition-root logic (no chrome.* needed);
              # confirmation-modal.test.tsx opts into a jsdom environment for DOM rendering
pnpm e2e      # Playwright — the real built extension against local fixture pages (#31)
```

## Note on `chrome.debugger`

Perception and action execution (from M2/M3 onward) use `chrome.debugger` (CDP) to read
and act on the page. Chrome shows an "Aegis is debugging this browser" banner while
attached — this is expected browser behavior for any extension using the Debugger API
and cannot be suppressed; see `docs/DESIGN.md` for why this tradeoff was accepted over
manual DOM scripting.

# 0013 — Side panel & background composition root

## Context

#25 asks for the side panel shell, a typed background↔panel channel, a Zustand store, and
start/stop/pause "wired to the loop." Every prior security ADR (0010, 0011, 0012)
explicitly deferred building the real `PolicyService` adapter and the real
`ModelRoutingConfig`-backed `LoopServices` to "composition-root work" — `apps/extension`'s
background script, per CLAUDE.md ("background (composition root)"). This is that root:
it's the first place `@aegis/agent`, `@aegis/security`, `@aegis/llm`, `@aegis/perception`,
and `@aegis/actions` are wired together into one running loop. Several concrete gaps
needed resolving that no prior issue had touched.

## Decisions

1. **`createPolicyService` adapter** (`background/policy-service.ts`) bridges
   `@aegis/security`'s per-action `PolicyEngine.evaluate(action, origin)` to
   `@aegis/agent`'s per-batch `PolicyService`. The batch's decision is the _strictest_ of
   any single action's (`deny` > `confirm` > `allow`), regardless of which action in the
   list produced it — a `deny` appearing after a `confirm` must still deny the whole
   batch. `origin` is resolved via `chrome.tabs.get(tabId).url`, freshly on every check
   (not cached), since a `navigate` action earlier in the same run can change it.
2. **`buildLoopServices`** (`background/build-loop-services.ts`) assembles a complete,
   real (non-mock) `LoopServices` + `ExecutorContext` for one `tabId`: `createChromeCdpSession`
   - `getPerceptionPayload` for `perceive`; `createChromeTabManager` + `createActionRunner`
     for `act`; `createPlannerService`/`createNavigatorService`/`createVerifierService`/
     `createCriticService` over a `ModelRouter` built from `ProviderRegistry` +
     `loadModelRoutingConfig` for `plan`/`decide`/`verify`/`checkAlignment`; the new
     `createPolicyService` for `checkPolicy`. If no `ModelRoutingConfig` has been saved yet
     (no options UI exists to write one until #28), this fails with a real, user-actionable
     `MODEL_ROUTING_NOT_CONFIGURED` error rather than a stub — BYOK software with no
     configured provider correctly can't run yet; that's not a placeholder to work around.
3. **Two storage areas, not one.** `docs/DESIGN.md` §4 specifies loop state persists to
   `chrome.storage.session` (cleared on browser restart) while config (model routing,
   site policies) must survive a restart — `chrome.storage.local`. `createRunManager`
   therefore takes two `StoragePort`s; `buildLoopServices` only ever sees the local one.
4. **One active run at a time**, matching the side panel being one surface per window.
   `RunManager` tracks a single actor; a second `START_RUN` while one is ongoing (`active`
   _or_ `paused` — see below) is rejected with `RUN_START_FAILED`, sent only to the
   requesting port, not broadcast.
5. **Rehydration on startup.** `RunManager.initialize()` calls `hydrateAgentLoopSnapshot`;
   an ongoing snapshot gets `buildLoopServices` + a fresh CDP `attach()` and resumes via
   `createActor(machine, {input, snapshot})` (exercising the resume path #15/#19 built but
   never wired to anything real until now); a terminal one is just cleared.
6. **`LoopRunOutcome` gains `'paused'`** (`packages/agent/src/loop/summary.ts`). It was
   previously folded into `'active'`, which made a paused run indistinguishable from a
   running one — the side panel can't show "Resume" vs "Pause" without knowing which.
   This also means "is this run still ongoing" (blocks a new `START_RUN`, still holds its
   CDP session, still worth resuming after eviction) is `outcome !== done/failed/stopped`,
   not `outcome === 'active'` — `isRunOngoing` in `run-manager.ts` encodes this.
7. **Messaging is a typed `chrome.runtime.connect` port**, not one-off `sendMessage` calls
   — a live status stream fits a persistent connection better than polling.
   `messaging/port.ts` defines a transport-agnostic `MessagePort<TSend, TReceive>`;
   `chrome-port.ts` is the real adapter, `fake-port.ts` an in-memory pair for tests — the
   same ports-and-adapters shape used everywhere else in this codebase, applied to
   `chrome.runtime` for the first time.

## A build-tooling note

WXT 0.20.x's `imports: false` does **not** stop its unimport Vite plugin from running
(`wxt/dist/builtin-modules/unimport.mjs` installs `UnimportPlugin.vite(...)` unconditionally,
regardless of the `disabled` flag it computes) — it only skips generating type
declarations. Since this monorepo's domain packages are bundled directly from source (no
per-package build step) and use plain parameter names like `storage` that collide with
WXT's built-in `wxt/utils/storage` auto-import preset, the plugin was rewriting
`packages/agent/src/loop/persistence.ts` to import a binding that doesn't exist outside
an entrypoint context, failing the build. Fixed via `imports.exclude` (a real
unimport/unplugin option `WxtUnimportOptions`'s published type doesn't declare, hence the
cast in `wxt.config.ts`) scoping the transform away from `packages/**` entirely.

## Consequences

- `@aegis/agent` still has zero dependency on `@aegis/security`; the sibling boundary
  (ADR 0010/0011) holds — `policy-service.ts` lives in `apps/extension`, importing both.
- `run-manager.test.ts` exercises the full lifecycle — start, reject-while-active,
  stop, multi-port broadcast, disconnect, build/attach failure, and rehydration
  (including the "already terminal, don't resume" and "still-ongoing, resume and it's
  still controllable" cases) — entirely through `createFakePortPair` and an injected
  fake `buildLoopServices`, no `chrome.*` global needed.
- A working end-to-end run still requires #28 (options — models & keys) to actually save
  a `ModelRoutingConfig`; until then, starting a run correctly surfaces
  `MODEL_ROUTING_NOT_CONFIGURED` rather than silently doing nothing.

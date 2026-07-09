# @aegis/extension

The WXT (Manifest V3) app. This is the composition root: it wires the domain packages
(`@aegis/agent`, `@aegis/security`, `@aegis/actions`, `@aegis/perception`, `@aegis/llm`,
`@aegis/shared`) to `chrome.*` APIs and hosts the UI.

- `entrypoints/background.ts` — service worker; owns the CDP session and agent loop via
  `background/run-manager.ts`.
- `entrypoints/sidepanel/` — React side panel (chat input, run controls, live status,
  action trace; confirmation-gate UI is #27).
- `messaging/` — the typed `chrome.runtime.connect` bridge between them.
- `background/` — the real, non-mock `LoopServices` composition (see ADR 0013).

Styling is Tailwind CSS + shadcn/ui (components vendored under `components/ui/`, shared
class-merge helper in `lib/utils.ts`).

## Side panel shell & messaging bridge (#25)

See [ADR 0013](../../docs/adr/0013-side-panel-composition-root.md) for the full design.
Summary:

- `messaging/protocol.ts` defines `PanelToBackgroundMessage`
  (`START_RUN`/`STOP_RUN`/`PAUSE_RUN`/`RESUME_RUN`) and `BackgroundToPanelMessage`
  (`RUN_IDLE`/`RUN_STATUS`/`RUN_START_FAILED`) over one named port
  (`RUN_BRIDGE_PORT_NAME`). `messaging/port.ts`'s `MessagePort<TSend, TReceive>` is the
  transport-agnostic shape both `chrome-port.ts` (the real `chrome.runtime.connect`
  adapter) and `fake-port.ts` (an in-memory connected pair, for tests) implement.
- `entrypoints/sidepanel/run-store.ts`'s `createRunStore(port)` is a Zustand store built
  from an injected port — `entrypoints/sidepanel/store.ts` wires the real one in; tests
  use `createFakePortPair`. `App.tsx` reads/drives it: a task textarea, Start (or
  Stop/Pause/Resume depending on status), and a status panel (step/replan counts, task
  summary, last error).
- `background/run-manager.ts`'s `RunManager` owns the single active run, broadcasts
  `RUN_STATUS` to every connected panel on each transition, persists the snapshot to
  `chrome.storage.session` after every transition, and resumes an ongoing (not just
  terminal) snapshot on startup (`initialize()`) — a paused run survives a service-worker
  restart, not just an actively-running one.
- `background/build-loop-services.ts` + `background/policy-service.ts` assemble the real
  `LoopServices`/`ExecutorContext` pair — every port is a genuine adapter
  (`createChromeCdpSession`, `createActionRunner`, `ProviderRegistry` + `ModelRouter`, a
  new `PolicyEngine`-backed `PolicyService`), not a stub. Starting a run before any
  provider is configured (no options UI exists yet — #28) fails with a real,
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

## Commands

```bash
pnpm dev      # wxt dev server (Chrome)
pnpm build    # production build to .output/chrome-mv3
pnpm build:edge
pnpm test     # vitest — messaging, store, and composition-root logic (no chrome.* needed)
```

## Note on `chrome.debugger`

Perception and action execution (from M2/M3 onward) use `chrome.debugger` (CDP) to read
and act on the page. Chrome shows an "Aegis is debugging this browser" banner while
attached — this is expected browser behavior for any extension using the Debugger API
and cannot be suppressed; see `docs/DESIGN.md` for why this tradeoff was accepted over
manual DOM scripting.

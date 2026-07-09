# 0019 — E2E: read-only use cases

## Context

#31 is the first issue to exercise the _entire_ built extension end-to-end: the real
`.output/chrome-mv3` build, loaded unpacked into a real Chromium window, running its real
background composition root (`RunManager` → `buildLoopServices` → the real XState loop,
real CDP perception, real CDP action executors) against real pages — with "a mock/local
model" standing in for a paid provider so it's deterministic and needs no API key. Nothing
like this existed yet; every decision below had no precedent.

## Decisions

1. **Fixture sites are static HTML served by a small local HTTP server**
   (`e2e/static-server.ts`), not real websites — no external network dependency, no
   flakiness from a third party changing their page. Three fixtures under `e2e/fixtures/`:
   `research.html` (a fact stated in plain text), `compare.html` (a price hidden behind a
   reveal button, exercising a real DOM mutation the agent must re-perceive), `gated.html`
   (an access-code gate revealing protected content client-side).
2. **The "mock/local model" is a real local HTTP server implementing just enough of the
   OpenAI chat-completions wire format** (`e2e/fake-model-server.ts`, `POST /chat/
completions`) for `@ai-sdk/openai-compatible` — the same adapter a real OpenAI-
   compatible/Ollama config would use — to parse, rather than swapping in a test double at
   the DI layer. This exercises the actual `ProviderRegistry` → `createOpenAiCompatibleProvider`
   → `runGenerateText` path, not a bypass of it. Verified against the real adapter directly
   (isolated from the browser) before wiring it into the full harness: the minimal valid
   response is just `{choices: [{message: {content}, finish_reason}]}` — `id`/`created`/
   `model`/`usage` are all nullish in `OpenAICompatibleChatResponseSchema`.
3. **Each scenario's scripted responses are looked up per-role, per-call-index** — the fake
   server buckets calls by a prefix of the incoming `system` message (which planner/
   navigator/verifier each send a distinct, recognizable one of) and returns the next
   response in that role's list, repeating the last once exhausted (the same "repeat last
   response" convention `@aegis/llm`'s own `createMockProvider` already uses).
4. **A scripted Navigator response never hardcodes an element ref.** Refs are assigned by
   the real perception aggregator at runtime and aren't stable/predictable from outside
   it. Instead, `e2e/find-ref.ts`'s `findRef(prompt, nameSubstring)` regex-parses the
   _actual_ "Available elements" list out of the real prompt text sent to the fake server
   (`- [ref] role "name"` — `navigator/prompt.ts`'s exact format) and returns whichever
   ref's accessible name matches a substring the fixture's HTML controls. This is what
   makes the scenario scripts robust to perception-aggregator internals rather than
   brittle to one specific ref-numbering scheme.
5. **Every scenario only proposes `read`/`input`-risk actions** (`extract`, `click`,
   `input_text`) with element names chosen to avoid `STATE_CHANGING_KEYWORDS` (e.g. "Access
   code" / "Enter", not "Password" / "Submit") — so `decideForRisk` always resolves
   `allow` and the confirmation gate never engages. This is a deliberate scope boundary:
   "read-only use cases" means no human-in-the-loop interaction, matching #32's separate
   scope ("E2E: confirmation-gated task").
6. **Two tabs, not one: a fixture tab and the side panel loaded as an ordinary tab.**
   Playwright can't drive an actual Chrome side panel surface directly, but
   `chrome-extension://<id>/sidepanel.html` is a normal URL — opening it in a regular tab
   runs the exact same `App.tsx`/`run-store.ts` code a real side panel would. The catch:
   the side panel's own "Start" handler resolves the target tab via
   `chrome.tabs.query({active: true, currentWindow: true})`, so the _fixture_ tab must be
   the active one at the moment Start is clicked — re-asserted via `fixturePage.bringToFront()`
   right before filling in the task, since opening the side-panel-as-a-tab can steal
   foreground focus. Playwright can still fill/click on a non-foreground tab's page (CDP
   input dispatch doesn't require visual focus), so this doesn't block driving the panel
   itself.
7. **`chrome.storage.local` is seeded directly** (`e2e/seed-storage.ts`, via
   `serviceWorker.evaluate`), bypassing `@aegis/llm`'s `StoragePort`/schema layer, since
   this runs from outside the extension's module graph. The storage key
   (`'model-routing-config'`) is duplicated from `model-routing.ts` rather than imported,
   since the E2E harness can't import background-only internals across the page/worker
   boundary Playwright evaluates in.
8. **Headed, not headless — both locally and in CI.** Unpacked MV3 extension loading and
   `chrome.debugger` both need a real browser window; Playwright's own guidance and this
   issue's acceptance criteria ("CI headed mode") agree. The new `e2e` CI job (separate
   from the four core gates, matching CLAUDE.md's "also available" framing of Playwright
   E2E) runs Chromium under `xvfb-run` on `ubuntu-latest`.

## A discovered gap, deliberately not fixed here

Building "authenticated read" surfaced that `apps/extension/background/policy-service.ts`
calls `engine.evaluate(action, origin)` — never passing a third `riskContext` argument.
`classifyActionRisk`'s `STATE_CHANGING_KEYWORDS` elevation (a button literally named "Buy
Now" or a field named "Password" bumping `input` risk to `state_changing`) therefore never
actually triggers in the real running system: `PolicyCheckInput` (`packages/agent/src/
loop/services.ts`) carries only `actions`, with no perception/element-name to build a
`riskContext` from. This doesn't block #31 — every scenario here was deliberately named to
avoid the keyword list regardless — but it's a real gap in the "state-changing actions
ALWAYS require confirmation" invariant (`CLAUDE.md`) that #32 ("E2E: confirmation-gated
task") will need to close, since a confirmation-gated E2E scenario built around this
keyword-elevation path would otherwise silently never confirm. Flagged here rather than
fixed, since closing it means threading perception/element names through
`PolicyCheckInput` and the `policyCheck` state's invoke input — a real cross-package
change belonging to the issue that's actually about the confirmation gate.

## Consequences

- `pnpm --filter @aegis/extension e2e` (`playwright test`) runs all three scenarios
  serially against a fresh persistent Chromium profile per test; verified locally (headed,
  Windows) reliably green across repeated runs before being wired into CI.
- `vitest.config.ts` gained an explicit `exclude: [..., 'e2e/**']` — Playwright's own
  `*.spec.ts` files would otherwise collide with vitest's default test-file glob.
- No `SitePolicy` needs seeding for these scenarios — `read`/`input` risk is always
  `allow` regardless of mode as long as the origin isn't hard-deny-listed, and the fixture
  server's `127.0.0.1` origin never is.

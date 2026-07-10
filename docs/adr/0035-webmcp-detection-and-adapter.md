# 0035 — WebMCP detection + adapter: `document.modelContext`, a two-world event bridge, no live composition-root wiring yet

## Context

Issue #87 (Phase 2, M10) asks the extension to feature-detect a page's own declared
WebMCP tools (an actively-evolving, origin-trial browser API — "may be entirely absent,"
per its own scope text) and wrap them as `source: "webmcp"` `Tool`s, cleanly, without ever
assuming the API exists. Unlike MCP (#83-86), WebMCP has no official SDK to wrap — the
spec itself (https://webmachinelearning.github.io/webmcp/) explicitly declines to define
how a browser agent (as opposed to same-page script) discovers registered tools at all:
"this specification does not prescribe the format in which tools are exposed to the
browser agent." A Manifest V3 extension has to invent that bridge itself.

## Decision

- **Targets `document.modelContext`, not `navigator.modelContext`.** Chrome renamed the
  attribute (Chrome 150+) after early drafts used `Navigator`; targeting the current
  guidance is the defensible choice for an actively-shifting spec, and the ADR record
  here documents exactly which interpretation this codebase built against, so a future
  spec change is a small, isolated update (see Consequences).
- **A two-world event bridge, not a single script.** A content script's ISOLATED world
  (real `chrome.*` access) and a page's MAIN world (real `document.modelContext` access)
  are different JS realms — a live `execute` function reference cannot cross that
  boundary, only structured-cloned data can. So the bridge is two halves:
  `page-bridge.ts` (`installWebMcpPageBridge`, runs MAIN-world) reads
  `document.modelContext` directly and is the only code that ever calls a tool's real
  `execute`; `isolated-bridge.ts` (`createWebMcpEventBridgeSource`, runs ISOLATED-world)
  implements the domain-level `WebMcpSource` port entirely over a request/response event
  protocol (`bridge-protocol.ts`) dispatched on the shared `document` — every call is
  `dispatch a JSON-safe event, wait for the correlated response`, never a direct call.
- **Feature detection is unconditional and silent, both ways.** `installWebMcpPageBridge`
  checks `target.modelContext === undefined` and, if so, still answers
  `WEBMCP_REQUEST_SYNC_EVENT` with an empty tool list rather than doing nothing — so an
  ISOLATED-world half installing _after_ a no-tools page-bridge gets an immediate answer,
  not a multi-second timeout. Both halves are written to install correctly regardless of
  which one loads first (`webmcp-bridge.test.ts` proves both orders explicitly) — content
  script injection order across worlds isn't spec-guaranteed.
- **The domain layer (`WebMcpToolDescriptor`, `WebMcpSource`, `registerWebMcpTools`,
  `inferWebMcpToolRisk`) mirrors `@aegis/mcp`'s existing MCP-tool shape closely** —
  `registerWebMcpTools(registry, source)` registers each tool as `web.<name>` (flat,
  unlike MCP's `mcp.<server>.<tool>`, since a WebMCP tool always belongs to whichever
  single page is currently active — no second server segment to namespace against).
  `inferWebMcpToolRisk` mirrors `inferMcpToolRisk`'s fail-safe convention:
  `readOnlyHint: true` → `read`, anything else (including no annotations) →
  `state_changing`. WebMCP's `untrustedContentHint` annotation is a different concern (a
  tool's _return value_ trust, not action risk) and doesn't factor into risk at all —
  same pre-existing, documented gap MCP tool results already have (#82 sanitizes a tool's
  _description_ before it reaches a prompt; sanitizing a tool's _result_ is a broader,
  cross-cutting question this issue doesn't newly introduce or attempt to close).
- **`registerWebMcpTools` stays in sync with the page's _live_ tool list**, not just a
  load-time snapshot: it subscribes to `source.onToolsChanged` (the spec's `toolchange`
  event, relayed over the bridge) and re-diffs the registry — a tool the page adds later
  gets registered, one it removes gets unregistered — automatically, matching "opportunistic,
  dynamic fast-path" rather than a one-shot detection. A failed resync is swallowed (never
  throws) and simply leaves the last-known-good tools registered — "graceful, never
  affects unrelated flows" applies to bridge failures mid-run, not just absence at load.
- **Real content-script entrypoints exist** (`apps/extension/entrypoints/
webmcp-page-bridge.content.ts`, `world: "MAIN"`; `webmcp-relay.content.ts`, default
  ISOLATED world) — this issue's scope explicitly says "from a content script," so the
  detection mechanism had to be wired into the real extension, not just proven in
  `packages/mcp`'s own tests. The ISOLATED-world script tears itself down via WXT's
  `ctx.onInvalidated` (fires on navigation and tab close alike, since the browser
  invalidates a content script's whole context then) — satisfying "clean teardown...on
  navigation/tab close" for real, not just in a unit test.
- **No live composition-root wiring into a running task's `ToolRegistry` yet.** The
  ISOLATED-world content script detects tools and logs them; it does not relay them to
  the background, and `buildLoopServices` doesn't consult them. This mirrors the exact
  precedent #85/#86 already set for MCP (build + thoroughly test the mechanism; wire it
  into a live run only once a concrete consumer needs it) — here, that consumer is #88
  ("WebMCP preferred-action routing"), whose whole job is deciding when the Navigator
  should prefer a WebMCP tool; wiring a background relay now, with no routing logic to
  exercise it, would be untested, speculative plumbing.

## Consequences

- Adding `@aegis/mcp` as `apps/extension`'s first real dependency surfaced a genuine,
  measurable bug: both content scripts initially bundled to ~215KB each — nearly all of
  `@modelcontextprotocol/sdk` and the rest of `@aegis/mcp`'s barrel, even though each
  script imports exactly one function. `packages/mcp/package.json` had no `sideEffects:
false`, so bundlers couldn't prove the unused re-exports were safe to drop. Adding it
  cut both content scripts to ~2-5KB — a real fix, not a nice-to-have, since a bloated
  content script re-injects into every single page load. Also moved test-only exports
  (`startMockMcpServer`, `createFakeWebMcpSource`) out of the main `src/index.ts` barrel
  into a `@aegis/mcp/testing` subpath, so a production consumer never has a reason to
  pull in `mock-mcp-server.ts`'s real Node HTTP server in the first place. Worth applying
  `sideEffects: false` to this monorepo's other domain packages too, as a follow-up —
  not done here to stay scoped to what this issue's own change surfaced.
- If Chrome (or another browser) changes the attribute name, method signatures, or
  discovery mechanism again, only `page-bridge.ts`'s local `PageModelContext`/
  `WebMcpCapableTarget` interfaces and its feature-detection line need to change — the
  domain layer (`WebMcpSource`, `registerWebMcpTools`, `Tool` wrapping) and the
  ISOLATED-world half are entirely insulated from that shape by the event-based
  `bridge-protocol.ts` boundary.
- `registerWebMcpTools`/`WebMcpSource` are fully built, exported, and unit-tested but have
  no caller in `apps/extension` yet — #88 is expected to call `registerWebMcpTools`
  against a `WebMcpSource` reachable from the background (which itself will need a new
  content-script-to-background relay this issue deliberately didn't build) once it has
  Navigator-preference logic to actually exercise it.

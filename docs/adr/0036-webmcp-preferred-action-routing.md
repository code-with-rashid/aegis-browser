# 0036 — WebMCP preferred-action routing: background relay, prompt preference, fixed trace-savings estimate

## Context

Issue #88 (Phase 2, M10) asks the Navigator to prefer a page's declared WebMCP tool over
DOM clicking when it covers the active sub-goal, fall back to DOM actions when it
doesn't, and make the savings visible in the trace — all still fully gated by the
existing risk/policy/critic/confirmation stack (#82). #87 deliberately stopped short of
wiring a detected WebMCP tool into a running task's `ToolRegistry` at all (ADR 0035): the
content-script bridge existed and was thoroughly tested, but nothing connected it to the
background composition root, since #88 was always meant to be the first issue that
actually needed a live tool to route to.

## Decision

- **A new background-side relay (`webmcp-tab-bridge.ts`) closes the gap #87 left open.**
  It mirrors `isolated-bridge.ts`'s own shape one level up: a per-tab `WebMcpSource`
  backed by a `chrome.runtime` port instead of DOM `CustomEvent`s, the same
  request/response-correlated protocol, the same bounded wait for a first snapshot, the
  same resync-on-change behavior. `webmcp-relay.content.ts` (already built in #87) now
  actually forwards its local bridge's tool list and calls over this port rather than
  just logging; `background.ts` wires `listenForWebMcpTabConnections` to
  `webMcpTabBridge.registerPort`, and `buildLoopServices` now accepts a `WebMcpSource`
  and calls `registerWebMcpTools` against it — so a task started on a tab whose page
  already declared WebMCP tools has them live in its `ToolRegistry` from the first
  `deciding` step. A missing/failed registration is never fatal to starting a task
  (`isOk(webMcpRegistration)` gates whether `unregister()` runs on `detach()`; the
  registration call itself never throws) — matching WebMCP's "never hard-depend on it"
  design principle end to end, not just at the content-script layer.
- **"Preference" is a prompt instruction, not a decision tree.** The Navigator has no
  hand-written tool-selection algorithm anywhere — it's an LLM choosing from whatever
  `formatTool()` lists, already uniformly for browser/mcp/webmcp tools since #81. Adding
  a real "prefer it" rule would mean re-implementing judgment the model already has
  access to. `NAVIGATOR_SYSTEM_PROMPT` gained one paragraph: a tool id under `mcp.`/`web.`
  is a _declared_ capability, not a simulated click, and should be preferred over a
  DOM-action sequence when it directly covers the sub-goal. For CI's scripted
  Navigator responses (this codebase never calls a real LLM in tests, per ADR 0019), the
  "preference" itself is asserted by which tool call the fixture's E2E spec scripts —
  the same "prove the infrastructure, not the model's judgment" split every other
  scenario in this codebase already draws.
- **Trace savings are a fixed, documented estimate, not a measurement.**
  `ESTIMATED_DOM_STEPS_PER_DECLARED_TOOL_CALL = 3` is credited to `TraceActionEntry` as
  `estimatedDomStepsSaved` for any successful `mcp`/`webmcp` call. There's no way to know
  how many DOM steps a given goal would _actually_ have taken without also running that
  path — measuring it would defeat the point of preferring the tool. The constant exists
  to make savings visible (`TraceList` renders "(~3 DOM steps saved)"), not to claim
  precision; a failed declared-tool call earns no credit.
- **The E2E proof (`webmcp-preferred-routing.spec.ts`) uses two near-identical fixtures**
  — `webmcp-shipping.html` (declares one read-only `get_shipping_estimate` WebMCP tool via
  a real, spec-shaped `document.modelContext` polyfill) and
  `webmcp-shipping-fallback.html` (the identical calculator UI, no WebMCP at all). The
  tool is deliberately `readOnlyHint: true` (risk `read`, always `allow`) rather than a
  state-changing example: the confirmation gate UI still only ever previews _browser_
  actions (`buildConfirmationRequest` takes `Action[]`, not `ToolCall[]`) — giving a
  non-browser tool call its own confirmation preview is explicitly #90's job
  ("trace + confirmation for tool calls"), not this issue's. Both specs run the real
  built extension with its real content scripts and the real background relay this issue
  adds — not a stand-in for any of it. The tool path completes in one `acting` cycle; the
  DOM fallback (select destination + click Calculate, then read the revealed text) takes
  two — a real, provable "fewer steps," not an assumed one.

## Consequences

- `buildLoopServices`'s new `webMcpSource` parameter defaults to a trivial "no tools"
  source (`NO_WEBMCP_TOOLS_SOURCE`) so every existing caller/test keeps working
  unchanged; `createRunManager`'s new `getWebMcpSource` parameter defaults the same way.
  Only `apps/extension/entrypoints/background.ts` wires the real
  `createWebMcpTabBridge()`.
- The confirmation UI still can't preview a non-browser tool call — a state-changing
  MCP/WebMCP tool call would reach `confirming` with an empty/incomplete preview today.
  This was already true before this issue and remains explicitly #90's gap to close, not
  something this issue's fixture choice (a read-only tool) papers over silently — it's
  the reason that choice was made, documented here rather than accidentally avoided.
- `estimatedDomStepsSaved` is a constant, not configurable — if this ever needs to vary
  by tool/task complexity, that's a deliberate future change, not an oversight; the
  constant's own doc comment says so.

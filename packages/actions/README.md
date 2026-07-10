# @aegis/actions

Typed browser actions. Hosts the Zod action schemas (`click`, `input_text`, `scroll`,
`navigate`, tab management, dropdowns, keys, `wait`, `extract`, `done`) each tagged with a
risk level (`read | navigate | input | state_changing`), the unified `Tool`/`ToolRegistry`
abstraction (#80), the CDP-backed executors (ref → node → real input events), and the
action runner (sequential execution, bounded retry, stall detection, abort).

## Action schemas & risk classifier

`ActionSchema` (`schema/index.ts`) is a Zod discriminated union (on `type`) over all 14
built-in actions; `Action`/`ActionType` are its inferred types. Every `ref` field is
validated as a non-empty string and branded as an `ElementRef` via a `.transform`.

`classifyActionRisk(action, context?)` (`risk.ts`) gives each action type a base risk —
`read` (`get_dropdown_options`, `wait`, `extract`, `done`), `navigate` (`navigate`,
`go_back`, `open_tab`, `switch_tab`, `close_tab`), or `input` (`click`, `input_text`,
`scroll`, `select_dropdown_option`, `send_keys`). An `input`-class action is elevated to
`state_changing` when the target element's accessible name matches a
`STATE_CHANGING_KEYWORDS` signal (e.g. "Submit Order", "Card number", "Delete account") —
a coarse, fast, keyword-based check; the alignment critic (#23) and per-site policy engine
(#21) apply deeper judgment on top. `read`/`navigate` actions are never elevated — no
target could make reading or navigating destructive.

`validateAction` (`validate-action.ts`) validates a raw action against the compile-time-typed
`ActionSchema` union directly, when you want a real `Action` rather than going through the
registry below.

## Tool abstraction

`Tool` (`tool.ts`) is the one shape every callable capability implements, regardless of
where it comes from: a built-in browser action (`source: "browser"`), a tool exposed by an
external MCP server (`source: "mcp"`, #85), or a tool a page declares via WebMCP
(`source: "webmcp"`, #87). Each `Tool` has a namespaced `id` (e.g. `"browser.click"`,
`"mcp.github.create_issue"`), a `description`, a Zod `inputSchema` validated before
`execute` ever runs, a static `risk` (`read | navigate | input | state_changing`), and an
`execute(args, ctx)` that returns a `ToolResult` (a `Result<unknown, ToolExecutionError>` —
typed failure, never a thrown string).

`ToolContext` is currently identical to `ExecutorContext` (the live CDP session + tab
manager a `browser`-source tool needs); `mcp`/`webmcp`-source tools capture their own
transport (an `McpClient`, a page binding) via closure at registration time and can ignore
it.

`ToolRegistry` (`registry.ts`) is a runtime `id -> Tool` map — `register()`/`unregister()`,
`get()`/`has()`, `list({source?, risk?})` to filter, and `call(id, args, ctx)` to validate
then execute in one step. An unknown `id` or schema-invalid `args` come back as a typed
`ToolExecutionError` (`TOOL_UNKNOWN` / `TOOL_INVALID_ARGS`) rather than throwing, so a
hallucinated tool call from the model degrades to a normal error the agent loop can replan
from.

`createBrowserTools()` / `createDefaultToolRegistry()` (`browser-tools.ts`) build one `Tool`
per built-in action (`browser.<type>`), each wrapping `executeAction` unchanged — risk
matches the existing base-risk table in `risk.ts` (contextual elevation to
`state_changing` via element-name keywords still runs separately through
`classifyActionRisk`/`elevateRisk`, since a `Tool`'s `risk` is static but element-name
context is only known at call time).

## CDP action executors

`executeAction({ session, tabManager }, action)` (`executors/dispatch.ts`) is the single
entry point: it dispatches by `action.type` to one of 13 executors, using real input
events (never DOM mutation shortcuts):

- `resolveRef` (`executors/resolve-ref.ts`) turns a ref back into a live
  `Runtime.RemoteObjectId` via `DOM.resolveNode`, failing with `REF_NOT_FOUND` when the
  ref doesn't encode a backend node id, or `ELEMENT_DETACHED` when CDP can no longer find
  that node — expected on a dynamic page, handled as data, not an exception.
- `click`/`scroll` compute the element's on-screen center (`DOM.getBoxModel`, reusing
  `@aegis/perception`'s `getElementBounds`) and dispatch real
  `Input.dispatchMouseEvent`s (press+release, or a wheel event for scroll).
- `input_text`/`send_keys` focus the element (`Runtime.callFunctionOn` calling
  `.focus()`) then use `Input.insertText` / `Input.dispatchKeyEvent`.
  `send_keys` parses combos like `"Ctrl+A"` or `"Shift+Tab"` via `key-map.ts` — common
  automation keys plus any single character, not a full keyboard layout.
- `get_dropdown_options`/`select_dropdown_option` read/set a `<select>`'s value via
  `Runtime.callFunctionOn`, since native dropdown options aren't part of the AX/DOM
  element list.
- `navigate` is `Page.navigate`; `go_back` reads `Page.getNavigationHistory` and calls
  `Page.navigateToHistoryEntry` on the previous entry (CDP has no direct "go back").
- `open_tab`/`switch_tab`/`close_tab` go through a `TabManager` port
  (`tabs/tab-manager.ts`), **not** CDP's `Target` domain — see
  `docs/adr/0004-tab-actions-via-chrome-tabs-not-cdp-target.md` for why. The real
  adapter (`tabs/chrome-tab-manager.ts`) is backed by `chrome.tabs`; `FakeTabManager`
  (`tabs/fake-tab-manager.ts`) is the in-memory test double.
- `wait`/`extract`/`done` need no ref resolution: `extract` reuses
  `@aegis/perception`'s `getDomPerception` to read the page's readable content.

On any executor failure, `executeAction` best-effort attaches a screenshot
(`ActionExecutionError.screenshot`) via `@aegis/perception`'s `captureScreenshot` — a
screenshot-capture failure never masks the original error.

## Action runner

`createActionRunner()` (`runner/action-runner.ts`) orchestrates `executeAction` calls
with resilience, returning a `RunOutcome` of `'completed' | 'failed' | 'stalled' |
'aborted'`:

- **Sequential execution** — one action list at a time, each awaited before the next
  (browser actions mutate shared page state, so they can't run concurrently).
- **Bounded retry** — a failing action is retried up to `maxRetries` times (default 2,
  so 3 attempts total) with a delay between attempts (default 250ms), on the theory that
  some CDP failures are transient (a page still loading, a momentary detach).
- **Captured history** — every attempted action, its attempt count, and its `Result` are
  appended to `runner.history`, persisting across many `run()` calls so the agent loop /
  trace UI has a full record; `reset()` clears it for a fresh sub-task.
- **Stall detection** — before executing each action, `wouldStall` checks whether doing
  so would extend a run of `stallThreshold` (default 3) consecutive actions with the same
  `actionSignature` (`runner/action-signature.ts`: same type + same ref/url/tabId). This
  is deliberately checked **across** `run()` calls, not just within one list — a planner
  re-issuing the identical click turn after turn (because the page didn't change the way
  it expected) is the actual stall this is built to catch, and it surfaces as
  `{ kind: 'stalled' }` so the agent loop knows to replan rather than keep retrying.
- **Abort support** — an `AbortSignal` is checked before each action and during retry
  delays (an abortable `sleep`), so a user-initiated stop takes effect promptly rather
  than waiting for the current action's retries to exhaust.

Depends on `@aegis/perception`, `@aegis/shared`.

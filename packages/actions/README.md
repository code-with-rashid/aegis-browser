# @aegis/actions

Typed browser actions. Hosts the Zod action schemas (`click`, `input_text`, `scroll`,
`navigate`, tab management, dropdowns, keys, `wait`, `extract`, `done`) each tagged with a
risk level (`read | navigate | input | state_changing`), the extensible `ActionRegistry`,
the CDP-backed executors (ref → node → real input events), and the action runner
(sequential execution, bounded retry, stall detection, abort).

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

`ActionRegistry` (`registry.ts`) is a runtime `type -> {schema, baseRisk}` map, extensible
so MCP tool-actions (Phase 2) can `register()` alongside the 14 built-ins without changing
this API; an unregistered type classifies as the most restrictive risk (`state_changing`),
deny-by-default. For compile-time-typed access to just the built-ins, use `ActionSchema` /
`validateAction` / `classifyActionRisk` directly instead of going through the registry.

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

Depends on `@aegis/perception`, `@aegis/shared`.

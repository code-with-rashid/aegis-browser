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

Depends on `@aegis/perception`, `@aegis/shared`.

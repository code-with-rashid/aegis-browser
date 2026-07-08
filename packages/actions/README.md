# @aegis/actions

Typed browser actions. Hosts the Zod action schemas (`click`, `input_text`, `scroll`,
`navigate`, tab management, dropdowns, keys, `wait`, `extract`, `done`) each tagged with a
risk level (`read | navigate | input | state_changing`), the extensible `ActionRegistry`,
the CDP-backed executors (ref → node → real input events), and the action runner
(sequential execution, bounded retry, stall detection, abort).

Depends on `@aegis/perception`, `@aegis/shared`.

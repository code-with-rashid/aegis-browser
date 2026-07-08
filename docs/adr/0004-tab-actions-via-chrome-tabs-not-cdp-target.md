# 0004 — Tab actions go through `chrome.tabs`, not CDP's `Target` domain

## Context

`BUILD_PROMPT.md` (#13) scopes the CDP action executors as covering
"click/type/scroll/tab/dropdown/keys/navigate" — implying `open_tab`/`switch_tab`/
`close_tab` are CDP executors like the rest. But our action schemas (#12) define these
in terms of `tabId: number`, which is a `chrome.tabs.Tab.id` — a different identifier
space from CDP's `Target.createTarget`, which returns a `targetId: string`. There is no
direct mapping between the two without an extra lookup, and the whole point of
`switch_tab`/`close_tab` is to act on a tab the agent already knows by `chrome.tabs` id
(e.g. one perceived earlier, or opened by an earlier `open_tab` call in the same task).

## Decision

Tab actions are executed by a `TabManager` port (`tabs/tab-manager.ts`) backed by
`chrome.tabs.create`/`update`/`remove` (`tabs/chrome-tab-manager.ts`, the only file in
this package allowed to touch `chrome.*`), with an in-memory `FakeTabManager` test
double (`tabs/fake-tab-manager.ts`) — the same ports-and-adapters shape as `CdpSession`
(#7). `ExecutorContext` carries both a `CdpSession` (for on-page actions) and a
`TabManager` (for tab-strip actions); `executeAction`'s dispatch picks whichever the
action needs.

## Consequences

- Tab actions never touch CDP's `Target` domain, so there's no `targetId`/`tabId`
  translation layer to build or keep correct.
- `TabManager.currentTabId` gives `close_tab`/(future) other tab-relative actions a
  sensible "current tab" default without threading tab-id state through every call site;
  the composition root (issue #25+) is responsible for constructing one
  `TabManager` per agent session and keeping it in sync with `CdpSession.tabId` when the
  agent switches tabs.
- Screenshot-on-failure (#13's other scope item) is implemented once, in
  `executeAction`, rather than duplicated per-executor: on any executor's `Err` result,
  it best-effort captures a screenshot and attaches it to the returned error, without
  letting a screenshot-capture failure mask the original error.

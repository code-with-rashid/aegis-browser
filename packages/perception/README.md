# @aegis/perception

Builds the agent's model of the page. Hosts the `CdpSession` port (with a
`chrome.debugger` adapter and a `FakeCdp` mock), the accessibility-tree extractor and
normalizer (`PerceivedElement` with stable refs), the DOM pruner and readable-content
extractor, a vision fallback behind a `useVision` flag, and the aggregator/budgeter that
merges everything into one token-budgeted `PerceptionPayload`.

## `CdpSession`

`CdpSession` (`cdp/cdp-session.ts`) is a safe attach/detach/send/event-subscribe lifecycle
over one tab's Chrome DevTools Protocol connection, with commands and events typed
against the full CDP spec via the `devtools-protocol` package's `ProtocolMapping`
(`send<M extends keyof ProtocolMapping.Commands>(method, params)` — no hand-maintained
per-method types). `createChromeCdpSession` (`cdp/chrome-cdp-session.ts`) is the only
module in this package allowed to reference `chrome.*` — enforced by a repo-wide ESLint
rule — and is responsible for actually attaching via `chrome.debugger`. `createFakeCdp`
(`cdp/fake-cdp.ts`) is the in-memory test double.

**The "debugging this browser" banner.** `chrome.debugger.attach` puts a visible
"Aegis is debugging this browser" infobar on the tab — this is standard, unsuppressable
Chrome behavior for any extension using the Debugger API, not a bug. It's the tradeoff
for the accessibility tree, robust DOM access, precise input events, and screenshots
that CDP gives us over a content-script-only approach. `chrome.debugger.onDetach` and
`chrome.tabs.onRemoved` are watched so the session's `isAttached` state (and its
`chrome.debugger` listeners) stay correct if the user dismisses the banner or closes the
tab, instead of leaking a stale attachment or a dangling listener.

## Accessibility tree

`getPerceivedAxTree(session)` (`ax/ax-tree-source.ts`) enables the `Accessibility` domain
and pulls `Accessibility.getFullAXTree` over a `CdpSession`, then normalizes the raw
`AXNode[]` via `normalizeAxTree` (`ax/ax-tree-normalizer.ts`) into `PerceivedElement[]`
(`ax/perceived-element.ts`) plus a `refToBackendNodeId` map the action layer will use to
resolve a `ref` back to a real DOM node. Nodes CDP marks `ignored` and nodes with no
backing DOM node are dropped — they aren't something an action could target. Each ref is
derived deterministically from `backendDOMNodeId` (`ax:<id>`), so re-reading the same
page yields the same ref for the same element without any per-session ref registry.
`bounds` is left unset here; it's filled in once DOM cross-referencing is available (the
DOM pruner / perception aggregator, #9-#10).

Depends on `@aegis/llm`, `@aegis/shared`.

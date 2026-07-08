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

## DOM pruner & readable content

`getDomPerception(session)` (`dom/dom-source.ts`) enables the `DOM` domain and pulls the
whole document (`depth: -1, pierce: true`, so iframes/shadow roots are included) in one
CDP round trip, then derives two merge-ready outputs from that single tree:

- `pruneInteractiveElements` (`dom/interactive-pruner.ts`) — links, buttons, form
  controls, `<option>`s, and anything with an interactive ARIA role/tabindex/click
  handler, tagged `source: 'dom'` (refs derived from `backendNodeId` as `dom:<id>`, same
  stability guarantee as the AX extractor).
- `extractReadableContent` (`dom/readable-content.ts`) — the page's main readable content
  (article/list body text). This re-enables what Nanobrowser disabled after real content
  extraction proved unreliable: candidate containers (`article`/`main`/`section`/`div`/`body`)
  are scored by text density (text length minus link text, boosted by paragraph count and
  an `article`/`main` tag bonus), boilerplate (`nav`/`header`/`footer`/`script`/`style`/`aside`/`form`/`button`)
  is discarded, and the winning container's block-level text (`p`/`li`/`h1-h6`/`blockquote`/`td`/`pre`)
  is joined and capped at `maxLength` (default 4000 chars), reporting whether it truncated.

## Perception aggregator & budgeter

`getPerceptionPayload(session, { goal, maxTokens?, maxContentLength? })`
(`aggregator/perception-source.ts`) is the perception pipeline's single entry point: it
pulls the AX tree and the DOM pass over one `CdpSession`, then produces one
`PerceptionPayload` (`aggregator/perception-payload.ts`) via:

- `mergeElements` (`aggregator/merge-elements.ts`) — AX and DOM elements referring to the
  same physical node (matched by the backend node id embedded in `ax:<id>`/`dom:<id>`
  refs) are merged into one entry, re-keyed to a source-agnostic `el:<id>` ref. AX wins
  on real (non-`"unknown"`/non-empty) values; DOM fills gaps — see
  `docs/adr/0003-perception-aggregator-scope.md`.
- `rankByRelevance` (`aggregator/relevance.ts`) — a dependency-free keyword-overlap
  heuristic against the agent's current goal; stable-sorted, so ranking is deterministic.
- `aggregatePerception` (`aggregator/perception-payload.ts`) — takes elements in rank
  order until `maxTokens` (default 2000) is spent, using `estimateTokens`
  (`aggregator/token-estimate.ts`, a ~4-chars-per-token heuristic — no tokenizer
  dependency), then fits as much of the readable content as remains, truncating and
  reporting `truncated: true` deterministically once the budget is exceeded.
- `compressForHistory` (`aggregator/history-compression.ts`) — reduces a past
  `PerceptionPayload` to a minimal `{elementCount, topElements (ref/role/name only),
contentSummary, tokenEstimate}` for the agent loop to keep as history across many turns
  without blowing the prompt budget (see ADR 0003 for why this is scoped as "compress one
  payload," not "manage the history list").

Depends on `@aegis/llm`, `@aegis/shared`.

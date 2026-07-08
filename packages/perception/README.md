# @aegis/perception

Builds the agent's model of the page. Hosts the `CdpSession` port (with a
`chrome.debugger` adapter and a `FakeCdp` mock), the accessibility-tree extractor and
normalizer (`PerceivedElement` with stable refs), the DOM pruner and readable-content
extractor, a vision fallback behind a `useVision` flag, and the aggregator/budgeter that
merges everything into one token-budgeted `PerceptionPayload`.

Depends on `@aegis/llm`, `@aegis/shared`.

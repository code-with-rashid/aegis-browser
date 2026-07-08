# 0003 — Perception aggregator: ref merging, relevance ranking, and "compress history"

## Context

`BUILD_PROMPT.md` (#10) scopes the perception aggregator as "Merge AX+DOM (dedupe),
Relevance-rank vs the active goal, Enforce a token budget, compress history, Output
PerceptionPayload." Two parts needed a concrete design decision:

1. AX (#8) and DOM (#9) elements for the _same_ physical node carry different refs
   (`ax:<id>` vs `dom:<id>`) even though CDP's backend node id is identical across both
   domains — dedup requires recognizing that.
2. "Compress history" is ambiguous from the perception package's vantage point: the
   agent loop (not yet built — issues #15+) owns the actual multi-turn history/context
   list. Perception can't decide _how many_ past turns to keep.

## Decision

1. `mergeElements` extracts the shared backend-node id from each ref's `ax:`/`dom:`
   prefix, groups by it, and re-keys the merged entry to a source-agnostic `el:<id>` ref.
   AX fields win when both sources have a real value (AX is the primary perception
   source per `docs/DESIGN.md` §4; DOM fills gaps).
2. "Compress history" is implemented as `compressForHistory(payload)`: a pure function
   that reduces one `PerceptionPayload` to a minimal `{elementCount, topElements
(ref/role/name only), contentSummary, tokenEstimate}` summary. It compresses a single
   payload down to history-appropriate size; the agent loop decides how many compressed
   summaries to retain and when to call it — that policy lives with the loop, not here.

## Consequences

- Ranking/relevance/token-estimation live in `@aegis/perception`, fully unit-testable
  without a live browser (pure functions over `PerceivedElement[]`).
- No `ml`/tokenizer dependency: `estimateTokens` uses a ~4-chars-per-token heuristic,
  matching the "reliability is measured, not asserted" preference for a simple,
  deterministic mechanism over an opaque one for the MVP. Revisit only if measured drift
  from real provider tokenizers causes budget overruns in the eval harness (#33).

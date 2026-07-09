# 0025 — Filter hidden elements out of the DOM interactive pruner

## Context

Re-running the live-model eval suite after the ref-format fix (#71, ADR 0024) surfaced the
two findings that ADR 0024 explicitly deferred: `compare-and-summarize` now fails fast with
`ACTION_RUN_FAILED: Action "click" failed after retries`, and `authenticated-read` gets much
further (16 real steps vs. 0 before) but times out in the verification loop.

Live diagnostic traces (a logging proxy in front of the real model, plus service-worker
`console` capture for the raw CDP errors) showed both share one root cause. After a fixture
handler hides an element it just handled (`compare.html`'s "Reveal Plan B price" button sets
`this.hidden = true`; `gated.html`'s access-code gate sets `#gate.hidden = true`, hiding the
textbox and "Enter" button inside it), the Verifier judges the pre-action perception's
`subGoalAchieved: false` (a known, accepted design: `verifying` never re-perceives before
judging), the machine falls back to a fresh `perceiving` pass, and the Navigator — seeing the
same now-hidden element still listed as available — re-proposes the identical
already-executed action. Re-execution then fails at the CDP level: `DOM.scrollIntoViewIfNeeded`
returns `"Node does not have a layout object"` and `DOM.getBoxModel` returns `"Could not
compute box model."`, both textbook symptoms of a backend node with no rendered layout.

The retry loop in `action-runner.ts` blindly re-executes the same action up to 3 times with no
re-perception in between, so it can't self-correct; on `authenticated-read` the equivalent
pattern (re-offering an already-submitted, now-hidden form) burns steps without failing
outright, contributing to the verification-loop timeout instead.

Traced to `packages/perception/src/dom/interactive-pruner.ts`'s `isInteractive()`, which
checks tag, ARIA role, `onclick`, and `tabindex` but has no visibility awareness at all.
`packages/perception/src/ax/ax-tree-normalizer.ts` relies on Chrome's own AX computation,
which does exclude hidden nodes — but `merge-elements.ts`'s `mergeOne()` uses
`primary = ax ?? dom`, so when AX correctly has no entry for a hidden backend node, the
unfiltered DOM-sourced entry survives as the merged result and reaches the Navigator anyway.

## Decisions

1. **`interactive-pruner.ts` now skips a hidden element's entire subtree**, not just the
   element itself. `gated.html` hides `#gate` (the container), not the textbox/button inside
   it individually — matching real `display:none` semantics (hiding a container removes all
   descendants from rendering regardless of their own attributes) requires walking top-down
   and refusing to recurse into a hidden node, not just filtering each node against its own
   attributes in isolation. Replaced the shared bottom-up-agnostic `walkElements` (still used
   elsewhere, e.g. `dom-utils.test.ts`) with a local `walkVisible` in this file, since this is
   the only production caller and the skip-subtree behavior is specific to this pruning pass.
2. **Hidden means the `hidden` attribute, or an inline `style` containing `display:none` /
   `visibility:hidden`.** An attribute/inline-style check is sufficient for both fixtures
   (both hide via the boolean `hidden` DOM property, reflected as the content attribute) and
   avoids a `CSS.getComputedStyleForNode` CDP round-trip per candidate element. A full
   computed-style check (catching hiding done via an external/injected stylesheet) is
   explicitly out of scope — no observed failure needs it, and it would add a CDP call per
   element to the perception hot path.
3. **No change to `merge-elements.ts` or `ax-tree-normalizer.ts`.** The blind spot originates
   entirely in the DOM pruner; fixing it there means the merge layer's existing `ax ?? dom`
   priority is no longer exposed to a source that disagrees with AX on visibility.

## Consequences

- `interactive-pruner.test.ts` covers: `hidden` attribute on the element itself, inline
  `display:none`, inline `visibility:hidden`, a hidden container's non-hidden descendants
  (the `gated.html` shape), and confirms an ordinary visible element is unaffected.
- Elements hidden via `visibility:hidden` are excluded even though a descendant could in
  principle override it with `visibility:visible` (CSS lets a child re-show itself inside a
  `visibility:hidden` parent, unlike `display:none`). Treating both identically is a known
  simplification; no fixture exercises that override, and adding CSS-cascade-aware handling
  isn't justified by an observed failure.
- Discovered via, and only possible to root-cause because of, live-model eval runs — the
  scripted mock-mode suite never exercises this path, since a `FakeModelResponder` never
  re-proposes an action against a stale perception the way a real model reasoning over a
  fresh-but-still-wrong element list does.
- The temporary diagnostic scripts (logging proxies + service-worker console capture) used to
  confirm this were not committed, per the same one-off-diagnostics convention as ADR 0024.

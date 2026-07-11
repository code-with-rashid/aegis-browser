# 0045 — Deterministic workflow executor: replay without the planner

## Context

Issue #111 (Phase 3, M14) is the payoff of #108-#110: replay a recorded, parameterized
workflow's steps in order, via CDP, with zero LLM calls — the whole reason to record a
workflow instead of always re-invoking the agent loop. The hard problem isn't dispatching
a tool call (`ToolRegistry.call` already does that generically); it's that a recorded
step's `ref` almost never resolves against a genuinely fresh page load (Chrome assigns new
backend node ids per navigation), so replay has to actually use the resilient `selector`
#109 captured — and nothing in this codebase could resolve a CSS selector back to a live,
actionable element yet.

## Decisions

- **`ToolRegistry.call` directly, not `ActionRunner`.** The live agent loop's
  `ActService` routes `source: "browser"` calls through `ActionRunner` for its
  retry/stall-detection/history behavior — tuned for an LLM-driven loop encountering an
  unpredictable page across many attempts. A deterministic replay's failure mode is
  categorically different: "the page changed since this was recorded," which retrying the
  identical call cannot fix. Reusing `ActionRunner` here would just add retry latency
  before an inevitable failure; the right response to that failure is self-heal (#113),
  not another attempt.
- **Selector resolution produces a _new_ ref for the current session, reusing the
  existing action-execution pipeline rather than duplicating it.** `resolveStepTarget`
  tries the recorded `ref` first (cheap, and correct when replaying within the same page
  load a step was recorded against), then falls back to `DOM.getDocument` +
  `DOM.querySelector` + `DOM.describeNode` (new CDP surface, mirroring #109's
  `deriveSelector`'s shape in reverse) to get a fresh backend node id, synthesizes
  `dom:<id>` as a real `ElementRef`, and substitutes it into the step's `args` via a new
  `withTargetRef` (`@aegis/actions`) — the setter symmetric with #109's `targetRefOf`
  getter. The step then flows through the exact same `ToolRegistry.call` → real CDP
  executor path a live run already uses; nothing about click/type/scroll dispatch is
  reimplemented.
- **`withTargetRef` lives in `@aegis/actions` alongside `targetRefOf`**, not in
  `@aegis/workflows` — it's a pure operation over the `Action` union (set the ref,
  wherever that action type has one), the same "belongs with the schema it operates over"
  reasoning that placed `targetRefOf` there in #109. A future self-heal pass (#113)
  re-targeting a step after an LLM re-locates an element needs the identical setter.
- **A step whose target can't be resolved fails the run outright
  (`TARGET_NOT_FOUND`)** — this executor does not fall back to the LLM, by design; "no
  LLM calls on the happy path" extends to the unhappy path too for this issue. Recovery
  from that failure is explicitly #113's scope, kept out of this one to keep "deterministic
  execution" and "self-healing" as separable, independently testable concerns.
- **`runWorkflow` composes #110's `resolveWorkflowParams` with the new step executor** as
  the one public entry point, rather than requiring a caller to remember to bind params
  first. A `PARAM_VALUE_MISSING` failure happens before any tool is ever called — a
  missing required param is a configuration mistake the run should never attempt partway
  through.
- **`signal` is checked between steps, not injected mid-step into each CDP call.** A step
  already in flight when `abort()` fires completes rather than being interrupted
  mid-dispatch — simpler and safer than threading an `AbortSignal` through every action
  executor's CDP calls (which don't currently accept one), and a single step is short
  enough that this doesn't meaningfully delay a stop request.

## Consequences

- A recorded workflow now genuinely replays end-to-end with zero planner/navigator/
  verifier calls — the concrete, testable proof `PHASE_3_PROMPT.md`'s "record → compile →
  run" mission needed, not just a data model and a recorder with nothing to run them.
- `@aegis/actions` gains a small, generic, dependency-free capability (`withTargetRef`)
  useful to both this issue and #113 — not workflow-specific despite living to serve a
  workflow use case first.
- Step verification (checking a step's `expect` post-condition) and result capture are
  explicitly out of scope here — #112's job. This executor only reports whether the tool
  call itself succeeded or failed, not whether its effect was the intended one.

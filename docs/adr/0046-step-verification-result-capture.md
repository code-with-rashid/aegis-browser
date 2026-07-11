# 0046: Step verification & result capture

## Status

Accepted

## Context

#111's deterministic executor only proves a step's _tool call_ didn't error — a
`click` that lands on the wrong element, or a form submission the page silently
rejected, both still report `succeeded`. P3-1 (#108) already defined `WorkflowStep.expect`
(a `PostCondition`: `element_visible` / `element_hidden` / `url_matches` / `text_contains`),
but nothing evaluated it. #112 closes that gap: evaluate `expect` after a successful tool
call, capture whatever the tool call actually returned (an `extract` step's read text, an
MCP tool's response), and — on any step failure, of any kind — emit a typed signal that
#113's self-heal pass can act on.

## Decision

**Post-condition evaluation lives in the executor, not as a separate pass.** A step's
`succeeded` flag now means "the tool ran _and_, if `expect` was declared, its effect
verified" — folding the check into `executeWorkflow` (rather than a follow-up function a
caller might forget to invoke) makes "trusted" the only meaning `succeeded` can have.

**`evaluatePostCondition(condition, session): Result<boolean, WorkflowExecutionError>`**
is a new, self-contained module (`executor/evaluate-post-condition.ts`) rather than a
reuse of `resolve-target.ts`'s selector-resolution helper, because the two need opposite
error semantics for "selector matches nothing": for `resolveStepTarget` that's a real
failure (`TARGET_NOT_FOUND` — there's nothing to act on); for `element_visible`/
`element_hidden` it's a legitimate `false`/`true` result, not an error. Reusing the
error-throwing helper would have meant string-matching its error message to recover the
"not found" case — fragile and backwards. The new module does duplicate the
`DOM.getDocument`/`DOM.querySelector` two-call shape, but each call site now expresses its
own correct semantics directly.

**Visibility is `getComputedStyle` + `getClientRects().length > 0`**, evaluated via
`Runtime.callFunctionOn` — the same instant-of-check semantics `focusElement`/
`selectElementContent` (`packages/actions/src/executors/resolve-ref.ts`) already use for
DOM manipulation, just read-only here. `url_matches`/`text_contains` use `Runtime.evaluate`
(`window.location.href` / `document.body.innerText`) — the first use of that CDP method
anywhere in this codebase (every prior read went through the AX tree or DOM domain); it's
the only way to answer "what does the browser currently think the URL/rendered text is"
without building a bespoke AX/DOM-domain equivalent for two simple reads. `DOM.resolveNode`
is called directly with `{ nodeId }` here rather than round-tripping through
`@aegis/actions`' `resolveRef`/`ElementRef`: this module only needs a live `objectId` for
one immediate `Runtime.callFunctionOn` call, not a durable, re-usable ref, so minting one
(and pulling in `toElementRef`/`backendNodeIdOfRef` parsing) would add a layer with nothing
behind it.

**A new `WorkflowExecutionErrorCode`, `POST_CONDITION_CHECK_FAILED`**, distinct from
`TARGET_NOT_FOUND`/`TOOL_CALL_FAILED` — it means the check itself couldn't run (a detached
session, a broken document), never that the condition was simply unmet (that's a `false`
result, handled as a normal step failure, not a thrown error).

**`WorkflowStepResult` gains `output?: unknown`** — the tool call's own `Result.value`,
captured whenever the tool call itself succeeded, independent of whether `expect` later
fails it. A step that submits a form and gets back a confirmation id, then fails its
`element_visible` check, still keeps that id in `output` — useful context for whoever (a
human reviewing a failed run, or #113's healer) decides what to do next. `unknown` rather
than a narrower type: `ToolRegistry.call`'s return value is `unknown` by design (tools are
heterogeneous — browser actions, MCP calls), and this layer has no basis for narrowing it
further.

**A typed `NeedsHealingSignal` (`{ stepId, reason, message }`) is attached to every
`failed` `WorkflowRunOutcome`**, not just post-condition failures — `reason` is
`'target_not_found' | 'tool_call_failed' | 'post_condition_failed'`, covering all three
ways a replay can stop. Previously a `failed` outcome only carried `failedStepId` plus a
per-step `errorMessage`; a caller wanting to decide _how_ to recover (retarget vs. replan
vs. give up) had no structured way to tell the three failure modes apart short of parsing
`errorMessage` strings. This issue only detects and reports the signal — acting on it (an
LLM-driven repair, or a policy decision to abandon the run) is explicitly #113's job, not
this one's.

## Consequences

- `WorkflowRunOutcome`'s `failed` variant is a breaking shape change (new required
  `needsHealing` field) — acceptable pre-1.0, and every existing caller (`runWorkflow`,
  its tests) only reads `.kind`/`.failedStepId`, so nothing broke.
- #113 (self-heal) can now dispatch directly on `needsHealing.reason` instead of
  re-deriving it from step state.
- Selector-based post-conditions cost two extra CDP round-trips per checked step
  (`DOM.getDocument` + `DOM.querySelector`, beyond the tool call itself) — acceptable for
  a deterministic replay that's already forgoing the far larger cost of an LLM call per
  step.

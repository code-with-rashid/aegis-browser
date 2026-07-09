# 0027 — Give the Navigator the overall task, not just the sub-goal

## Context

Following up on #73/#75 (ADRs 0025/0026), further live-model runs (real `gpt-4o-mini` via
OpenRouter) of `authenticated-read` kept surfacing a persistent failure mode distinct from
both prior fixes: the Navigator typed a literal placeholder string (`<your_access_code>`,
`<access_code_here>`) into the access-code field instead of the real code `1234` — not a
one-off slip that then self-corrected, but consistently for an entire run (one trace hit
27+ steps, every single one proposing the same placeholder, never once the real value).

Root cause: `DecideInput` (`packages/agent/src/loop/services.ts`) only carried `subGoal`
and `perception` — never the original overall task. `buildNavigatorPrompt`
(`packages/agent/src/navigator/prompt.ts`) only rendered `Sub-goal: ${input.subGoal}`. The
Planner is free to paraphrase a sub-goal however it likes — e.g. "Access the webpage for
the members area" instead of "Enter access code 1234..." — and when it drops the literal
value, the Navigator has no way to recover it: the model wasn't being unreliable, it
genuinely lacked the information anywhere in its context. `packages/agent/src/loop/machine.ts`'s
`deciding` state constructed the Navigator's input as
`{ subGoal: context.subGoal ?? context.task, perception }` — `context.task` was available
in the same closure but only used as a fallback for `subGoal` itself, never passed through
as its own field. `CriticCheckInput` already carries `task` separately (its own comment:
"the user's original, trusted task — what alignment is judged against"); only the
Navigator's input type was missing it.

This is a third, distinct root cause from #73 (hidden elements leaking into perception)
and #75 (`input_text` not clearing existing content): a clean run where the Planner's
paraphrase happens to restate the literal value works fine regardless, and #75's fix
correctly makes retries idempotent — but neither prior fix could help when the model never
had the correct value to type in the first place.

## Decisions

1. **Added `task: string` to `DecideInput`**, and pass `context.task` through in the
   `deciding` state alongside the existing `subGoal` fallback.
2. **`buildNavigatorPrompt` now renders `Overall task: ${input.task}`** above the existing
   `Sub-goal:` line — always present, not conditional, since the Navigator should always
   have this grounding available regardless of how literal the current sub-goal is.
3. **Updated `NAVIGATOR_SYSTEM_PROMPT`** to explicitly instruct the model to fall back to
   the overall task's own wording for a literal value the sub-goal doesn't restate, and to
   never invent/template/placeholder a value — directly naming the failure mode observed
   (`"<access_code>"`-style fabrication) so the instruction is concrete, not generic.
4. **No sanitization needed for the new line.** Like the Planner's `Task: ${input.task}`
   (unwrapped, unsanitized) and the Critic's `task` field, the overall task is the user's
   own trusted instruction, not page-derived content — it doesn't go through
   `wrapUntrustedContent`/`sanitize` the way perceived page content does.

## Consequences

- `navigator/prompt.test.ts`, `navigator/create-navigator-service.test.ts`, and
  `loop/machine.test.ts` updated for the new required field; a new test in each locks in
  that the overall task actually reaches the Navigator's prompt / the machine's Navigator
  invocation.
- Verified against the live model: across many repeated live-eval runs after this fix,
  zero `authenticated-read` timeouts (previously a 26-28 step hang was common) — the
  remaining occasional live-eval failures on this task are unrelated to Aegis's own logic:
  free-text summary wording that doesn't hit the eval harness's exact substring check
  (known non-determinism, not a functional bug), and, once, an OpenRouter `402` from the
  test account running low on credits after this session's heavy live-mode usage (an
  external/environmental condition, not a code defect).
- Found via, and only reproducible through, live-model runs where the Planner's paraphrase
  genuinely dropped the literal code from its sub-goal wording — the mock-mode suite's
  scripted planner responders always restate the literal value, so this gap was invisible
  to it.

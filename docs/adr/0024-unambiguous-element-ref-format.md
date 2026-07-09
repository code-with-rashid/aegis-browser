# 0024 — Unambiguous element-ref prompt format

## Context

The first live-model run of the reliability eval harness (#33), against real `gpt-4o-mini`
via OpenRouter, surfaced a genuine reliability bug: `authenticated-read` burned 6+ steps
and most of its 8-replan budget without ever completing, and a captured trace (a local
logging proxy sat in front of the real model, forwarding every request and logging the
prompt + response) showed why — the model kept proposing `{"ref":"[el:3]"}` instead of
`{"ref":"el:3"}`, copying the square brackets from the prompt's `- [el:3] textbox "Access
code"` element list as if they were part of the ref itself. `hallucinated-refs.ts`
correctly rejected these, the one built-in retry sometimes fixed it and sometimes didn't,
and the _next_ Navigator call (a new sub-goal) made the identical mistake again.

## Decisions

1. **Changed the element-ref display format** in both `navigator/prompt.ts`'s
   `formatElement` and `planner/prompt.ts`'s `summarizeElements`, from
   `- [${ref}] ${role} "${name}"` to `- ref="${ref}" role="${role}" name="${name}"` —
   every field explicitly labeled and quoted, with no delimiter character (like `[` `]`)
   that a model could plausibly fold into the value it's told to copy "verbatim". The
   Planner doesn't emit refs itself, but both builders were changed together so every role
   reading perception describes elements with the same vocabulary.
2. **Verified the fix against the real model, not just reasoning about it.** Re-ran
   `compare-and-summarize` live through the same logging-proxy technique used to diagnose
   the bug: **0 ref-hallucination corrections and 0 schema-violation retries across 4
   calls**, versus dozens of correction cycles in the pre-fix trace. The click that used to
   trigger hallucinated-ref corrections now resolves on the first attempt.
3. **Didn't chase every other failure mode this surfaced.** The same live runs also hit an
   `ACTION_RUN_FAILED` (a CDP click execution failure, unrelated to LLM output) and a
   verification-loop timeout on a different scenario — real findings, but a different root
   cause each, and out of scope for "the ref format is ambiguous." Chasing every live-model
   reliability question in one pass isn't realistic (`docs/DESIGN.md` §14 already names
   "reliability ceiling is real" as an accepted risk); this fix closes the one clearly
   diagnosed, clearly fixable bug the investigation actually found.
4. **`packages/eval-harness/src/find-ref.ts`'s parsing regex updated to match** — from
   `/-\s\[([^\]]+)]\s+\w+\s+"([^"]*)"/g` to `/-\s+ref="([^"]+)"\s+role="[^"]*"\s+name="([^"]*)"/g`.
   Every existing scenario script (`findRef(userPrompt, name)`, matching by accessible
   name, not ref format) kept working unchanged — only the harness's own parsing needed to
   track the new format.

## Consequences

- `navigator/prompt.test.ts` and `planner/prompt.test.ts` assert the new
  `ref="..." role="..." name="..."` format; `find-ref.test.ts`'s fixture prompt updated to
  match.
- Discovered via — and only possible to diagnose because of — the reliability eval harness
  (#33) actually being run in live mode against a real model. The mock-mode E2E/eval suite
  never would have caught this, since a scripted `FakeModelResponder` never makes the
  mistake a real model makes.
- The temporary logging-proxy scripts used to capture and then re-verify the live traces
  were not committed — one-off diagnostics, not permanent tooling; `evals/README.md`
  already documents how to run live mode yourself if this needs re-diagnosing later.

# 0044 — Workflow parameterization: a `‹param:name›` placeholder, mirroring `‹secret:name›`

## Context

Issue #110 (Phase 3, M13) makes a recorded workflow (#109) take typed, run-time inputs
instead of always replaying the exact literal values a run happened to use — a search
term, a form field, or (if the original run typed a credential directly rather than via
an existing `‹secret:name›` placeholder) a value that should never be replayed as a
literal at all. `@aegis/security` already has an established convention for exactly this
kind of "the model/workflow never sees the real value, only a placeholder" problem
(`‹secret:name›`, resolved at native-fill time) — but its resolver (`resolveActionSecrets`)
is hardcoded to the known `Action` union's specific fields (`input_text.text`,
`send_keys.keys`), and a `WorkflowStep.args` is `unknown` (a browser action or an
arbitrary MCP/WebMCP tool's args shape), so it can't be reused directly.

## Decisions

- **A parallel `‹param:name›` placeholder, byte-for-byte the same delimiter convention as
  `‹secret:name›`** (`toParamPlaceholder`/`findParamPlaceholderNames`, same guillemet code
  points built via `String.fromCodePoint`, not literal characters in source). A workflow
  param and a vault secret are visually and structurally the same _kind_ of thing —
  "a placeholder standing in for a value resolved elsewhere" — just resolved by different
  mechanisms at different times.
- **A generic `mapStringsDeep` deep-walker**, since `resolveActionSecrets`'s narrow,
  `Action`-specific `switch` can't be reused for arbitrary `args: unknown`. It recurses
  through arrays and plain objects, rewriting every string leaf via a caller-supplied
  mapper — used for both directions: literal-to-placeholder (`parameterizeValue`/
  `parameterizeSecret`) and placeholder-to-value (`resolveWorkflowParams`).
- **`parameterizeSecret` never stores the literal value it's asked to remove.** The
  literal is used only to find-and-replace occurrences in `steps`; the returned `param` is
  `{kind: 'secret', name, secretName}` with no value anywhere. This matters because a
  recorded run might have captured a real credential typed directly (not already behind a
  `‹secret:›` placeholder) — parameterizing it is exactly the operation that must scrub
  that literal out of what gets persisted, not just decorate it with a param name.
- **`resolveWorkflowParams` never touches a `SecretVault`.** A `secret`-kind param's
  placeholder resolves to _another placeholder_ — `toSecretPlaceholder(param.secretName)`
  (reused directly from `@aegis/security`, not reimplemented) — not a real value. The
  actual vault lookup stays exactly where it already happens for a live agent run: the
  existing `resolveActionSecrets` pipeline, immediately before native CDP fill
  (`docs/adr/0012-secret-vault.md`), composition-root work for a later issue to wire a
  deterministic executor through, not this function's job. This keeps "the workflow layer
  never sees a real secret value" true without `@aegis/workflows` needing any vault
  dependency at all.
- **`validateWorkflowParams` checks both directions but only requires one.** Every
  placeholder a step references must have a matching declared param
  (`PARAM_NOT_DECLARED`), and no two params may share a name (`PARAM_DUPLICATE`) — but a
  declared param nothing yet references is not flagged. A future builder UI (#119) may
  reasonably let a user add a param before finishing the edit that uses it; erroring on
  that would make normal, incremental editing fail validation for no real safety reason.
- **`@aegis/security` is a new dependency of `@aegis/workflows`** (for `toSecretPlaceholder`
  only) — expected per `PHASE_3_PROMPT.md`'s own dependency list, and confirmed
  cycle-free: `@aegis/security` depends on `actions`/`llm`/`shared`, none of which depend
  on `@aegis/workflows`.

## Consequences

- A recorded workflow's steps can be safely shared/persisted/edited without ever leaking
  a literal secret value the original run happened to type directly — the same guarantee
  a live run already has, extended to the record → parameterize → replay path.
- `resolveWorkflowParams`'s output still contains `‹secret:name›` tokens for secret-bound
  params — whichever issue wires the deterministic executor (#111) through to real
  execution must also wire `resolveActionSecrets` (or an equivalent) afterward; this
  issue's job ends at producing correctly-placeholdered steps, not final execution.
- `mapStringsDeep` is now the one generic string-rewriting primitive in
  `@aegis/workflows` — any future step-rewriting need (e.g. self-heal patching a step's
  args, #113) should reuse it rather than writing another bespoke walker.

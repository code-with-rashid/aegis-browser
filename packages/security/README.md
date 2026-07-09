# @aegis/security

Aegis's safety layer, on by default. Hosts the trust-tagging sanitizer (page content is
wrapped as untrusted data, never instructions), the per-site policy engine
(`ask | allow | deny` + `allowStateChanging` + a high-risk deny-list), the confirmation
gate (mandatory human approval for state-changing actions), the alignment critic (a
second model pass that blocks misaligned/injected actions), and the encrypted secret
vault (WebCrypto AES-GCM + PBKDF2, `‹secret:name›` placeholders, native fill).

## Trust-tagging & sanitizer

The real sanitizer `@aegis/agent`'s `identitySanitize` placeholder (#16-#19) is meant to
be replaced by, per `docs/DESIGN.md` §7.1 and CLAUDE.md's security invariants — page
content is untrusted DATA, never instructions, wrapped and sanitized before it ever
reaches a model:

- `stripInvisibleChars` (`sanitize/strip-invisible-chars.ts`) strips zero-width
  formatting characters (U+200B/U+200C/U+200D/U+2060/U+FEFF) and the Unicode "Tags"
  block (U+E0000-U+E007F, used for invisible ASCII-smuggling) — built from numeric code
  points rather than literal characters in a regex, since this file is exactly the place
  those characters must never appear even by accident.
- `neutralizeInstructions` (`sanitize/neutralize-instructions.ts`) replaces
  instruction-like imperatives ("ignore previous instructions", "new instructions:",
  "act as...") and spoofed role/control markers (`SYSTEM:`, `<|im_start|>`, `[INST]`)
  with an explicit `[REMOVED: instruction-like content]` marker — visible in a trace, but
  never the original command text.
- `sanitizePageContent` composes both, in order: stripping invisible characters first
  means a phrase hidden by interspersing zero-width characters becomes contiguous again
  before the instruction patterns get a chance to match it.
- `wrapUntrustedContent` labels sanitized text in an explicit `<untrusted-page-content>`
  envelope; `TRUST_BOUNDARY_SYSTEM_CONTRACT` is the canonical system-prompt fragment
  telling a model to treat everything inside that envelope as inert data, never a
  command, regardless of its claimed authority or urgency.
- `injection-fixtures.test.ts` exercises realistic indirect-prompt-injection payloads
  end-to-end through `sanitizePageContent` — hidden "ignore previous instructions" (via
  zero-width characters and via invisible Unicode Tag characters), spoofed
  system/assistant messages, and chat-template control tokens — proving each is
  neutralized, not just pattern-matched in isolation.

This package doesn't import `@aegis/agent` (nor vice versa) — a composition root wires
`sanitizePageContent` into the `sanitize: SanitizeText` option each agent
(Planner/Navigator/Verifier) already accepts.

## Security policy engine

Per-site gating of actions, per `docs/DESIGN.md` §7.3/§7.5. See
[ADR 0009](../../docs/adr/0009-policy-decision-matrix.md) for the full risk x mode
decision matrix; summary:

- `SitePolicy { origin, mode: ask|allow|deny, allowStateChanging, expiresAt? }`
  (`policy/site-policy.ts`) is the persisted, user-configurable policy for one origin.
  `isPolicyExpired` treats an origin past its `expiresAt` ("allow for this session") as
  unconfigured again.
- `isDenyListedOrigin` (`policy/deny-list.ts`) is a hard-coded high-risk deny-list
  (banking, `.gov`/`.mil`, adult) that blocks an origin outright unless the user has
  stored an explicit `mode: "allow"` policy for that exact origin.
- `decideForRisk` + `resolveEffectiveMode` (`policy/evaluate-policy.ts`) are the pure
  decision core: classify the action's risk (via `@aegis/actions`' `classifyActionRisk`),
  resolve the effective mode (stored policy, deny-list, or the `"ask"` default), then
  decide `allow` / `confirm` / `deny`. `evaluatePolicy` composes both for one call. No
  I/O — this is what the exhaustive risk x mode x `allowStateChanging` matrix tests
  exercise directly.
- `PolicyStore` (`policy/policy-store.ts`) persists every origin's policy as one
  `Record<origin, SitePolicy>` via a `StoragePort`. `PolicyEngine`
  (`policy/policy-engine.ts`) is the thin async composition of `PolicyStore.getPolicy` +
  `evaluatePolicy` — the `evaluate(action, origin, riskContext?)` API #21 asks for.

Depends on `@aegis/actions`, `@aegis/llm`, `@aegis/shared`.

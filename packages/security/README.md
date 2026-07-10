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
  decision core: resolve the effective mode (stored policy, deny-list, or the `"ask"`
  default), then decide `allow` / `confirm` / `deny` for an already-classified `risk`.
  `evaluatePolicy` composes both for one call. No I/O — this is what the exhaustive risk
  x mode x `allowStateChanging` matrix tests exercise directly. This package has no
  notion of `Action`/`Tool` shapes at all (Phase 2, #82) — the caller classifies risk
  first (`@aegis/actions`' `ToolRegistry.classify`, which applies
  `STATE_CHANGING_KEYWORDS` elevation for browser tools) and passes the resolved
  `ActionRisk` in.
- `PolicyStore` (`policy/policy-store.ts`) persists every origin's policy as one
  `Record<origin, SitePolicy>` via a `StoragePort`. `PolicyEngine`
  (`policy/policy-engine.ts`) is the thin async composition of `PolicyStore.getPolicy` +
  `evaluatePolicy` — `evaluate(risk, origin)`.

## Secret vault & native fill

WebCrypto-encrypted storage for credentials, per `docs/DESIGN.md` §7.4 — the model never
sees a real secret value, only a placeholder. See
[ADR 0012](../../docs/adr/0012-secret-vault.md) for the canary-based wrong-passphrase
detection and why placeholder resolution lives here rather than in `@aegis/actions`.

- `createSecretVault(storage)` (`vault/secret-vault.ts`) builds a `SecretVault`: starts
  locked every session; `unlock(passphrase)` either bootstraps a fresh vault (first use)
  or derives the same key and verifies it against a stored canary — a wrong passphrase
  fails with `VAULT_WRONG_PASSPHRASE` without ever touching a real secret.
  `setSecret`/`getSecret`/`removeSecret`/`listSecretNames` all require an unlocked vault
  (`VAULT_LOCKED` otherwise); `lock()` clears the in-memory key, leaving persisted
  (encrypted) secrets untouched.
- `deriveVaultKey`/`encryptText`/`decryptText` (`vault/crypto-primitives.ts`) are the raw
  WebCrypto primitives: PBKDF2-SHA256 (600,000 iterations) key derivation, AES-GCM
  encrypt/decrypt with a fresh random IV per call. `crypto.subtle` is a global in both the
  MV3 service worker and Node (this package's test environment).
- `toSecretPlaceholder(name)`/`findSecretPlaceholderNames(text)` (`vault/secret-placeholder.ts`)
  build/parse the `‹secret:name›` placeholder token the model sees — built from numeric
  code points (`String.fromCodePoint(0x2039/0x203a)`), not literal characters in source,
  matching this package's convention for Unicode that must be reproduced exactly.
- `resolveActionSecrets(action, vault)` (`vault/resolve-action-secrets.ts`) resolves any
  placeholders in an `input_text`/`send_keys` action's free-text field to their real
  values via the vault — meant to run just before an action reaches `@aegis/actions`'
  executors (which already do native CDP fill, #13), so the resolved value exists only
  for the moment of execution, never upstream in a prompt or trace.
- The vault has no concept of a rotating/dynamic code (TOTP, SMS OTP) — only static named
  secrets. 2FA/MFA entry always falls to the human by construction, since there's nothing
  here that could produce one.

Depends on `@aegis/actions`, `@aegis/llm`, `@aegis/shared`.

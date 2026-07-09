# 0012 — Secret vault: canary-based wrong-passphrase detection, and where fill happens

## Context

#24 asks for a WebCrypto AES-GCM vault (key from a user passphrase via PBKDF2), storing
named secrets the model never sees directly — it sees `‹secret:name›` placeholders
(`docs/DESIGN.md` §7.4) — with native fill resolving them at execution, and 2FA/MFA
always handed off to the human. Two things needed a concrete design the issue didn't
spell out: how to detect a wrong passphrase (`AES-GCM` alone doesn't obviously give you
this for an _empty_ vault), and where placeholder resolution actually happens given
`@aegis/actions` cannot depend on `@aegis/security` (wrong layering direction — actions
sits below agent/security in CLAUDE.md's dependency graph).

## Decision

1. **A canary record detects a wrong passphrase.** On first unlock (no vault persisted
   yet), a fixed known plaintext (`CANARY_PLAINTEXT`) is encrypted under the newly
   derived key and stored alongside the salt. Every subsequent unlock decrypts the
   canary: AES-GCM's authentication tag makes decryption _reject_ under a wrong key
   (rather than silently returning garbage), and the decrypted text is also compared
   against the expected constant as defense in depth. Only on success is the derived key
   kept in memory. This means a wrong passphrase is detected immediately, without ever
   touching a real secret — necessary because if the vault has zero secrets stored yet,
   there'd otherwise be nothing to attempt decrypting to notice the mistake.
2. **The derived key never touches storage or the model** — it lives only in a closure
   variable inside `createSecretVault`, cleared by `lock()`. Only the salt and encrypted
   blobs (secrets + canary) are persisted, all as base64 strings (`StoragePort`
   round-trips through JSON, which can't carry raw binary).
3. **Placeholder resolution (`resolveActionSecrets`) lives in `@aegis/security`, not
   `@aegis/actions`.** The action executors already do "native fill" via CDP input events
   (`executeInputText`/`executeSendKeys`, #13) — nothing there needs to change. Resolving
   a `‹secret:name›` placeholder to its real value is a pre-processing step on the
   `Action` object _before_ it reaches those executors, and since `@aegis/security`
   already depends on `@aegis/actions` (for `Action`, since #21), it's a natural,
   correctly-directed home. Wiring this into the actual action-execution pipeline (e.g.
   wrapping the loop's `ActService`) is composition-root work, same deferral already
   established for the sanitizer (#20) and the real `PolicyService` (#22).
4. **2FA/MFA handoff is structural, not a runtime check.** The vault only stores static
   named secrets — there is no concept of a rotating/dynamic code (TOTP, SMS OTP) it
   could hand back. Since nothing in the vault can produce a 2FA code, entering one
   always requires the human's own device/authenticator; no explicit "is this a 2FA
   field" detection was built, since there's structurally nothing here that could fill
   one.

## Consequences

- `crypto-primitives.test.ts` proves the actual security property the acceptance
  criteria ask for: encrypt→decrypt round-trips under the same key, and decryption
  under a _different_ derived key rejects — the mechanism `secret-vault.test.ts`'s
  wrong-passphrase test relies on.
- `resolve-action-secrets.test.ts` includes a test that simulates a Navigator-produced
  prompt/action and asserts the real secret value is never a substring of it — only the
  placeholder is — directly exercising the "model context contains only placeholders"
  acceptance criterion.
- PBKDF2 at 600,000 iterations (OWASP's 2023 minimum for PBKDF2-HMAC-SHA256) makes vault
  tests noticeably slower (~30s for this package) than others in the monorepo — an
  accepted tradeoff, since weakening it purely for test speed would mean testing a
  different (weaker) derivation than what ships.

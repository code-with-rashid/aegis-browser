# 0018 — Options page: secret vault UI

## Context

#24 built `@aegis/security`'s `SecretVault` (WebCrypto AES-GCM, PBKDF2-derived key,
canary-based wrong-passphrase detection) but left it with no UI — #30 is that UI: unlock
with a passphrase, add/remove named secrets, show where a secret is used, and make "the
agent never sees the value" legible to the user, not just true in the implementation.

## Decisions

1. **"Show where used" means the placeholder token, not a usage log.** Nothing in this
   codebase associates a secret name with a site or a historical run — `@aegis/agent`'s
   planner/navigator have no reference to the vault at all, and wiring secret names into
   their prompts is out of scope for an options-page issue. The only concrete "where"
   a secret name is meant to appear is a `‹secret:name›` token
   (`toSecretPlaceholder`, from #24) inside a task's free text or an `input_text`/
   `send_keys` action, resolved by `resolveActionSecrets` at execution. Each secret row
   therefore displays its exact placeholder token with a Copy button — concrete enough
   for a user to paste into a task ("log in with ‹secret:github_password›") and trust
   that typing it is the entire mechanism, with no separate usage index to maintain or
   get stale.
2. **`SecretVaultPanel` takes an injected `SecretVault`**, matching #29's
   `PolicyStore`-injection precedent (ADR 0017) for the same reason: this issue's
   acceptance criteria are concrete and testable ("vault unlock/add/remove works",
   "values never rendered to logs/prompt"), so the component is tested against a real
   `createSecretVault(createMemoryStorage())` — exercising the actual crypto path, not a
   hand-rolled fake — rather than only via typecheck/lint/build.
3. **Secret names are restricted to `[a-zA-Z0-9_-]+`** (`secret-name.ts`). The vault
   itself and `findSecretPlaceholderNames`'s capture group would accept almost anything;
   the restriction exists purely so the placeholder token a user copies into a task is
   unambiguous to retype or re-paste, with no whitespace or delimiter characters to
   mangle.
4. **No "reveal existing secret" affordance.** Scope is add/remove; an existing secret's
   value is never displayed again after being set (`getSecret` is used only by
   `resolveActionSecrets` at execution, never by this UI). Re-adding an existing name
   overwrites it (the vault's own `setSecret` is already an upsert) — the natural way to
   "change" a secret, without a separate edit flow.
5. **Value input is masked (`type="password"`) with a Show/Hide toggle**, the same
   pattern as #28's API key field — one convention for "sensitive text the human is
   allowed to see but the UI hides by default" across the whole options page.

## Consequences

- The options page is now three tabs: Models & Keys (#28), Permissions (#29), Secrets
  (#30) — `App.tsx` owns one shared `chrome.storage.local` instance and constructs one
  `SecretVault`/`PolicyStore` each, passed down as props.
- `secret-vault-panel.test.tsx` exercises unlock (fresh + wrong-passphrase-on-existing +
  correct-passphrase-on-existing via two `SecretVault` instances sharing one
  `createMemoryStorage()`, mirroring `secret-vault.test.ts`'s own pattern), add, an
  invalid-name rejection, remove, masking, and lock — plus an explicit assertion that a
  just-added secret's raw value never appears in the rendered DOM.
- The vault stays locked every time the options page is opened fresh (`isUnlocked` starts
  `false`); the in-memory derived key only survives for the life of that page's JS
  context, matching `docs/DESIGN.md`'s intent that a passphrase is required each session.
- Wiring secret names into planner/navigator prompt context (so the model can discover
  what's available rather than the user needing to already know a name) remains an open
  gap this issue doesn't claim to close — nothing in `@aegis/agent` references the vault
  today, and no issue in the backlog currently covers it.

# @aegis/security

Aegis's safety layer, on by default. Hosts the trust-tagging sanitizer (page content is
wrapped as untrusted data, never instructions), the per-site policy engine
(`ask | allow | deny` + `allowStateChanging` + a high-risk deny-list), the confirmation
gate (mandatory human approval for state-changing actions), the alignment critic (a
second model pass that blocks misaligned/injected actions), and the encrypted secret
vault (WebCrypto AES-GCM + PBKDF2, `‹secret:name›` placeholders, native fill).

Depends on `@aegis/actions`, `@aegis/llm`, `@aegis/shared`.

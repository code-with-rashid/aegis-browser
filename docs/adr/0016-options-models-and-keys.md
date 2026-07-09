# 0016 — Options page: models & keys

## Context

#28 asks for the options UI that finally lets a user save a `ModelRoutingConfig` —
ADR 0013 already noted that a real run fails with `MODEL_ROUTING_NOT_CONFIGURED` until this
exists. Scope: add/edit provider + keys (masked) per agent role, a connection test, and
persistence that drives real runs. A few concrete decisions had no precedent yet.

## Decisions

1. **`entrypoints/options/` is a directory, not a single `options.html`.** WXT classifies
   an entrypoint's type from the first path segment under `entrypoints/`
   (`options/index.html` and `options.html` both resolve to the `"options"` type), so
   either works; the directory form matches the existing `sidepanel/` convention for a
   multi-file React entrypoint and keeps the same shape across both UIs.
2. **The connection test runs directly from the options page**, calling
   `ProviderRegistry.create` + `generateText` in-page rather than round-tripping through
   the background via a new message type. Extension pages (options, side panel, the
   background service worker) all get the same `host_permissions: ['<all_urls>']`
   CORS bypass already declared in `wxt.config.ts` for CDP/tab access — there's no
   CORS reason a provider call needs to originate specifically from the background.
   `testProviderConnection` (`test-connection.ts`) takes an injectable `ProviderFactory`
   (defaulting to a real `ProviderRegistry`) purely so tests can verify the
   success/failure wiring without a live network call or a real API key.
3. **A flat `ProviderDraft` (all fields as strings) separates in-progress editing from a
   validated `ProviderConfig`.** `toProviderConfig` re-parses the draft through the
   existing `ProviderConfigSchema` (discriminated union already built in #4) on every
   change rather than hand-rolling per-kind validation; a role's "Test connection" and the
   page-level "Save" are both disabled until their draft parses successfully.
4. **One explicit Save, not autosave-per-field.** All four roles must parse to a valid
   `ProviderConfig` before Save is enabled, so a half-filled draft can never overwrite a
   previously-working `ModelRoutingConfig` in storage.
5. **The API key input is masked (`type="password"`) with a Show/Hide toggle**, and the
   draft/config values are never passed to `logger`/`console` anywhere in this flow —
   directly satisfying the "keys masked and never logged" acceptance criterion.
6. **Options page opens in its own tab**, set via WXT's per-entrypoint
   `<meta name="manifest.open_in_tab" content="true">` convention in `options/index.html`
   (parsed straight from HTML meta tags — a `wxt.config.ts` `manifest.options_ui` override
   has no effect, since WXT recomputes `options_ui` from the entrypoint's own parsed
   options unconditionally). A full 4-role settings form doesn't fit the small panel Chrome
   shows inline inside `chrome://extensions` by default.

## Consequences

- `apps/extension/background/build-loop-services.ts`'s `MODEL_ROUTING_NOT_CONFIGURED` path
  (ADR 0013) is now actually reachable to fix, end-to-end, from the UI.
- `provider-draft.ts`'s `toProviderConfig`/`draftFromConfig` are pure and unit-tested
  directly (round-tripping all five provider kinds); `test-connection.ts` is tested via a
  fake `ProviderFactory`; `ProviderConfigForm`'s masking/reveal and per-kind field set are
  covered by a jsdom component test — the same layering (pure logic / injectable adapter /
  thin component) used throughout this codebase.
- If a future provider kind genuinely requires a background-only fetch (a real CORS
  restriction, not merely a convention), the connection test would need to move behind a
  new background message type — deferred until an actual provider demonstrates the need.

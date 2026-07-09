# 0017 — Options page: permissions panel

## Context

#28 built the options page's first tab (Models & Keys) as a single, un-tabbed `App.tsx`.
#29 adds a second surface — per-site policy management — so the options page now needs
more than one screen; #30 (secret vault UI) will add a third. A few decisions had no
precedent yet.

## Decisions

1. **The options page becomes tabbed** (`App.tsx`): "Models & Keys" and "Permissions" as
   sibling tabs, switched by local `useState<Tab>`. #28's original single-purpose
   `App.tsx` body moves, unchanged in behavior, into `models-and-keys-panel.tsx`'s
   `ModelsAndKeysPanel` — it now takes its `StoragePort` as a prop instead of
   constructing one internally, so `App.tsx` is the one place `chrome.storage.local` is
   touched directly and both panels share the same underlying storage.
2. **`PermissionsPanel` takes an injected `PolicyStore`, not raw `StoragePort`.** Unlike
   #28 (which left `ModelsAndKeysPanel`'s orchestration untested, matching the side
   panel's `App.tsx` precedent), #29's acceptance criteria explicitly says "Tested" — so
   the component depends on the already-existing `@aegis/security` port
   (`PolicyStore`: `getPolicy`/`setPolicy`/`removePolicy`/`listPolicies`) rather than a
   concrete adapter, letting tests drive it with an in-memory fake and assert on
   add/edit/remove behavior without any `chrome.*` global.
3. **Per-row auto-save, not a page-level Save button** — unlike Models & Keys, where all
   four roles had to become valid together before Save made sense. Each site policy is
   fully independent: changing one origin's mode or `allowStateChanging` checkbox calls
   `store.setPolicy` immediately, with a per-row saving/error indicator. There's nothing
   to batch.
4. **"Edits change gate behavior at runtime" is free.** `createPolicyStore` (built in
   #21) re-reads its backing `StoragePort` on every call — no in-memory cache — so a
   `PolicyEngine.evaluate` call made mid-run by `background/policy-service.ts` (ADR 0013) already sees whatever the options page most recently wrote to
   `chrome.storage.local`. No new plumbing was needed to satisfy this criterion.
5. **The deny-list section is read-only.** Scope says "view deny-list," not edit it;
   `DEFAULT_DENY_LIST_HOST_SUFFIXES` (from `@aegis/security`, #21) is rendered as a plain
   list. A user can still override an individual deny-listed origin by explicitly
   setting that exact origin's policy to `allow` (existing `resolveEffectiveMode`
   behavior from #21) — the panel's copy says so next to the list.
6. **Origins are canonicalized via `new URL(input).origin`** (`site-policy-draft.ts`)
   before being validated against `SitePolicySchema` — so `https://example.com/some/path`
   and `https://example.com` collapse to the same stored key, matching how policies are
   actually looked up (by origin, not full URL) in `evaluate-policy.ts`.

## Consequences

- `@aegis/security` gained no new exports — `PolicyStore`, `SitePolicy`,
  `PolicyMode`, `DEFAULT_DENY_LIST_HOST_SUFFIXES` were all already public from #21/#29's
  blockers.
- `models-and-keys-panel.test.tsx` doesn't exist (same untested-orchestration precedent
  as #28); `permissions-panel.test.tsx` does, covering list/add/reject-invalid-origin/
  edit-mode/remove/view-deny-list against a hand-written in-memory `PolicyStore` fake.
- `App.tsx` itself remains a thin, untested shell (tab switch + two `const` instances);
  the substantive logic it delegates to is fully covered in each panel's own tests.

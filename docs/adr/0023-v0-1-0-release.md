# 0023 — v0.1.0 release: cross-browser verification, docs, changelog

## Context

#35 is the last issue before tagging `v0.1.0`: verify Chrome + Edge builds, write a
README that lets a new user install/BYOK-setup/run, polish `docs/`, and version +
changelog + tag. A few decisions had no precedent yet.

## Decisions

1. **Edge was verified empirically, not just assumed-because-Chromium.** Microsoft Edge
   is installed on this machine (`C:\Program Files (x86)\Microsoft\Edge\Application\
msedge.exe`); Playwright's `chromium.launchPersistentContext` supports a `channel:
'msedge'` option that launches the real Edge binary. A one-off script (not committed —
   see decision 2) loaded the real `edge-mv3` build into real Edge, confirmed the side
   panel and options page both render, and ran the `research-and-extract` scenario
   end-to-end through the real Edge browser, reaching `done` with the correct summary.
2. **No permanent Edge CI job.** GitHub Actions' `ubuntu-latest` runners don't have Edge
   installed, and installing it would be nontrivial extra CI surface for a browser that's
   Chromium-based MV3-identical to what the existing `e2e` job already verifies on every
   PR. The one-off verification script was deleted after confirming it passed, rather than
   committed as dead weight only runnable locally on a machine with Edge installed.
   Chrome's build (and the entire agent loop running inside it) is exercised on every PR;
   Edge's build is verified to produce an equivalent artifact and was manually proven to
   load and run at release time.
3. **No version bump.** `package.json`'s `"version": "0.1.0"` was already correct — this
   release doesn't need to increment anything, just needs to actually exist as a tagged
   point in history.
4. **`docs/DESIGN.md` gets a light polish, not a rewrite.** Fixed three things that were
   genuinely stale: the "Working codename... rename before launch" placeholder (Aegis
   shipped under this name throughout, in every package name, README, and the manifest —
   never renamed), the closing "Design draft v0.1... next artifact: Phase 0 spike"
   sentence (written before any code existed, obviously wrong once the whole thing shipped),
   and the "content-script fast path" mentioned in the tech-stack table, repo tree, and
   §14 risks — `apps/extension/README.md`'s "Note on `chrome.debugger`" already documents
   that no content-script fast path was ever built; every perception/action call goes
   through CDP exclusively. Left everything else in the document as-is — it matches what
   was actually built closely enough that a full rewrite would mostly be reformatting, not
   correcting.
5. **`CHANGELOG.md` is new, one entry, grouped by subsystem rather than by issue number** —
   35 one-line-per-issue entries would be less useful to a reader than "here's what the
   security core does" as a unit. Explicitly calls out the two real bugs found and fixed
   while building the E2E/security test suites (the risk-context wiring gap from #31→#32,
   the navigate-destination-origin gap from #34), since a changelog documenting shipped
   defenses without mentioning the near-misses that got caught first would be less honest.
6. **The root `README.md` is a full rewrite**, not a patch — it was still the Phase-A
   bootstrap placeholder ("Early bootstrap. Scaffolding and implementation have not
   started yet.") the entire time this session built all 35 issues. New sections: Install
   (load-unpacked for both browsers, with exact menu paths), BYOK setup (walking the
   actual options-page tab labels and button text — "Models & Keys" / "Test connection" /
   "Save" / "Permissions" / "Secrets" — verified against the real rendered UI, not
   guessed), Usage (the actual side-panel button labels — "Start"/"Pause"/"Resume"/
   "Stop"/"Approve"/"Reject"/"Edit"), a Security model summary, and a Development section
   pointing at the real `pnpm` scripts that exist today (`e2e`, `eval`, `build:edge`).

## Consequences

- Both `pnpm build` (Chrome) and `pnpm --filter @aegis/extension build:edge` were run
  clean from a fresh `.output/` directory as part of verifying this issue, matching the
  acceptance criterion's "fresh clone → `pnpm install && pnpm build`" flow (`pnpm install`
  is exercised on every CI run already; a full fresh-clone-and-install pass was not
  additionally re-run locally, since CI's `gates` job already does exactly that on every
  push).
- The README's BYOK/usage instructions are grounded in the actual rendered UI text (cross-
  checked against `apps/extension/entrypoints/options/App.tsx` and
  `apps/extension/entrypoints/sidepanel/App.tsx`), not written from memory of the design
  doc — so they should stay accurate as long as the UI's button/tab labels don't silently
  drift without the README being updated alongside.

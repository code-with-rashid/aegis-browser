# @aegis/extension

The WXT (Manifest V3) app. This is the thin composition root: it wires the domain
packages (`@aegis/agent`, `@aegis/security`, `@aegis/actions`, `@aegis/perception`,
`@aegis/llm`, `@aegis/shared`) to `chrome.*` APIs and hosts the UI.

- `entrypoints/background.ts` — service worker; will own the CDP session and agent loop.
- `entrypoints/sidepanel/` — React side panel (chat, trace, confirmation gate).

Styling is Tailwind CSS + shadcn/ui (components vendored under `components/ui/`, shared
class-merge helper in `lib/utils.ts`).

## Commands
```bash
pnpm dev      # wxt dev server (Chrome)
pnpm build    # production build to .output/chrome-mv3
pnpm build:edge
```

## Note on `chrome.debugger`
Perception and action execution (from M2/M3 onward) use `chrome.debugger` (CDP) to read
and act on the page. Chrome shows an "Aegis is debugging this browser" banner while
attached — this is expected browser behavior for any extension using the Debugger API
and cannot be suppressed; see `docs/DESIGN.md` for why this tradeoff was accepted over
manual DOM scripting.

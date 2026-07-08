# Aegis

Aegis is a local-first, bring-your-own-key (BYOK) browser-automation agent for Chrome and Edge, built as a Manifest V3 extension.

## What it is

Aegis lets you drive your own browser with an LLM agent — clicking, filling forms, reading pages, navigating — without routing your browsing session through a third-party server. You supply your own API key for the model provider of your choice; Aegis runs the automation loop locally inside the extension.

## Principles

- **Local-first** — automation logic and browser control run on-device, inside the extension. No proxying of your browser session through external infrastructure.
- **BYOK** — you bring your own API key. No bundled backend, no metered usage through a middleman.
- **MV3 native** — built on Manifest V3 for Chrome and Edge, using the extension platform's own APIs rather than a bundled browser or remote debugging bridge.
- **Safety-first** — destructive or hard-to-reverse actions (submitting forms, making purchases, deleting data) require explicit user confirmation before Aegis acts. The agent is scoped to the permissions you grant it, and every action it takes is visible and auditable.

## Status

Early bootstrap. Scaffolding and implementation have not started yet.

## License

MIT — see [LICENSE](LICENSE).

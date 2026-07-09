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

**v0.1.0.** All of M0–M7 (`PROGRESS.md`'s milestone checklist) is implemented: the perception/action/agent-loop core, the security core (policy engine, confirmation gate, alignment critic, secret vault), the side panel and options UI, and end-to-end/reliability/security test suites running in CI. Phase 2 (MCP/WebMCP tool calling) and Phase 3 (record→compile workflows) are designed for but not yet built — see `docs/DESIGN.md`.

## Install (load unpacked)

Aegis isn't published to the Chrome Web Store or Edge Add-ons store yet — load it as an unpacked extension from a local build.

1. Clone the repo and build it:

   ```bash
   git clone https://github.com/code-with-rashid/aegis-browser.git
   cd aegis-browser
   pnpm install
   pnpm build          # Chrome — outputs to apps/extension/.output/chrome-mv3
   pnpm --filter @aegis/extension build:edge   # Edge — outputs to apps/extension/.output/edge-mv3
   ```

   Requires Node.js ≥ 22.13 and [pnpm](https://pnpm.io).

2. **Chrome**: open `chrome://extensions`, enable **Developer mode** (top right), click
   **Load unpacked**, and select `apps/extension/.output/chrome-mv3`.

3. **Edge**: open `edge://extensions`, enable **Developer mode** (left sidebar), click
   **Load unpacked**, and select `apps/extension/.output/edge-mv3`.

4. Pin the Aegis icon to your toolbar and click it to open the side panel.

## BYOK setup

Aegis never bundles a model or a backend — you configure your own provider before running any task.

1. Right-click the Aegis icon and choose **Options** (or open it from the extensions page).
2. On the **Models & Keys** tab, configure a provider for each of the four agent roles
   (Planner, Navigator, Verifier, Critic) — they can all point at the same provider/model,
   or be split (e.g. a stronger model for the Planner, a cheaper one for the Navigator).
   Supported providers: OpenAI, Anthropic, Google, Ollama (local), or any
   OpenAI-compatible endpoint. Click **Test connection** to verify a role's config before
   saving; your key is masked in the field and is never logged anywhere.
3. Click **Save**. A run can't start until all four roles have a valid, saved config.
4. Optionally, on the **Permissions** tab, add per-site policies (`ask`/`allow`/`deny`, and
   whether state-changing actions on that site can run without confirmation) and review the
   built-in hard deny-list. On the **Secrets** tab, unlock the encrypted credential vault
   with a passphrase and add named secrets you want Aegis to be able to use — the agent
   itself never sees the value, only a `‹secret:name›` placeholder token, which you
   reference by name in a task (e.g. "log in using ‹secret:my_password›").

## Usage

1. Open the side panel and make sure the tab you want Aegis to act on is the active tab in
   that window.
2. Type a task in plain language (e.g. "find the return policy on this page and summarize
   it") and click **Start**.
3. Watch the live action trace as Aegis perceives the page and proposes actions. Step and
   replan counters, and the current status, are always visible.
4. If Aegis proposes a state-changing action (submitting a form, making a purchase,
   deleting something), it pauses and shows a confirmation dialog with a plain-language
   preview of what it's about to do — **Approve**, **Reject**, or **Edit** the pending
   action before anything runs. Nothing state-changing ever executes without this gate.
5. **Pause**/**Resume**/**Stop** are available at any time. A run's trace and state survive
   a side-panel close and a service-worker restart.

## Security model

- Page content is always treated as **untrusted data**, never as instructions — sanitized
  and wrapped before it ever reaches a prompt.
- **State-changing actions always require human confirmation** by default; an independent
  alignment critic checks every gated action against your original task before you're even
  asked, catching actions that look induced by the page rather than by you.
- The model **never sees secret values** — only `‹secret:name›` placeholders, resolved to
  the real value at the last possible moment during native CDP fill.
- A per-site policy engine plus a hard deny-list (banking, government, adult content by
  default) governs what Aegis can act on; a `navigate`/open-tab action is checked against
  its _destination_, not just the page you're currently on.
- All of the above is exercised by an end-to-end security test suite (indirect
  prompt-injection fixtures, a "compromised navigator" worst case) that runs in CI — see
  `apps/extension/README.md`'s E2E/security sections and `docs/adr/0022-security-test-suite.md`.

## Development

```bash
pnpm install
pnpm typecheck   # tsc --noEmit across every package
pnpm lint        # eslint, zero warnings
pnpm test        # vitest, all packages
pnpm build       # wxt build — Chrome + every workspace package
pnpm format      # prettier --write

pnpm --filter @aegis/extension build:edge   # Edge build
pnpm --filter @aegis/extension e2e          # Playwright E2E against the real built extension
pnpm --filter @aegis/evals eval             # reliability eval harness (mock mode by default)
```

See `CLAUDE.md` for the full working agreement (architecture rules, code standards,
per-issue workflow) and `PROGRESS.md` for the milestone/issue checklist and the full ADR
log documenting every real design decision made while building this.

## Architecture

- `docs/DESIGN.md` — the original design & architecture spec.
- `docs/adr/` — architecture decision records for every real design decision made during
  implementation, including several that departed from or extended the original design.
- `apps/extension/README.md` — the extension app itself: composition root, side panel,
  options UI, E2E/security test suites.
- Domain packages (`packages/agent`, `packages/security`, `packages/actions`,
  `packages/perception`, `packages/llm`, `packages/shared`) are pure, framework-agnostic,
  and each has its own `README.md`.

## License

MIT — see [LICENSE](LICENSE).

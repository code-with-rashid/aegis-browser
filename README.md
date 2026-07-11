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

**v0.3.0.** All of M0–M17 (`PROGRESS.md`'s milestone checklist) is implemented: the
perception/action/agent-loop core, the security core (policy engine, confirmation gate,
alignment critic, secret vault), the side panel and options UI, MCP + WebMCP tool calling
(Phase 2), record→compile self-healing workflows with RunPolicy-gated unattended/scheduled
runs (Phase 3), and end-to-end/reliability/security test suites running in CI — see
`docs/DESIGN.md`.

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
6. Once a run reaches **Done**, a **Save as workflow** field appears — name it and save to
   turn what just happened into a reusable, deterministic **Workflow** (see below).

## MCP & WebMCP tools

Beyond clicking/typing/reading pages, Aegis can call declared tools directly — faster and
more reliable than driving a UI, when a tool covers what you asked for.

- **MCP (Model Context Protocol) servers** — a remote or local service exposing tools over
  Streamable HTTP. To add one: open **Options → Tools & MCP**, and under "Add an MCP
  server" enter a **Name**, the server's **URL**, and (only if it needs one) an **Auth
  header name** (e.g. `Authorization`) plus a **Vault secret name** referencing a value
  you've already added on the **Secrets** tab — the header's real value is resolved from
  the vault at connection time and never stored in the server config itself. Click **Add**,
  then **Discover tools** to see what the server offers (name, description, input schema,
  and its inferred risk — `read` or `state_changing`). Every discovered tool starts
  **"Pending review"**: use its permission dropdown to set **Allow** or **Deny** — nothing
  is ever auto-trusted, and an un-reviewed tool is never callable. Uncheck **Enabled** to
  disable a server without removing its configuration.
- **WebMCP** — pages can declare their own tools directly (via the emerging
  `document.modelContext` API); when one does, Aegis prefers calling it over driving the
  page's UI, since it's a direct, reliable capability rather than a simulated click. This
  is feature-detected automatically per page — nothing to configure per site. A single
  **"Use WebMCP tools when a page declares them"** checkbox on the **Tools & MCP** tab
  turns it off globally if you'd rather Aegis never use a page's declared tools at all.
- **Same safety gate as everything else.** A tool call — MCP, WebMCP, or a browser
  action — is classified `read` or `state_changing`, checked against the per-site policy
  and alignment critic, and a `state_changing` call pauses for the same confirmation
  dialog, now showing which tool would be called and a summary of its arguments. A tool's
  own description is treated exactly like page content: untrusted data, sanitized before
  it ever reaches a prompt, never an instruction.

Once a server's tools are allowed, just describe the task in the side panel as usual —
Aegis calls the tool directly when it covers the goal, with no other setup needed.

## Workflows

A one-off task doesn't have to stay one-off — record it once, then replay it forever with
**no LLM calls at all**, self-healing the one step that breaks if the site changes.

1. **Record**: complete any task in the side panel as usual. Once it reaches **Done**,
   type a name into **Save as workflow** and click it — the exact steps that just ran
   (what was clicked, typed, or extracted) are saved as a new **Workflow**.
2. **Manage**: open **Options → Workflows** to see every saved workflow. **Run** starts it
   again on demand (fill in any params it takes first); **History** shows every past run's
   status and a full step-by-step trace; **Delete** removes it.
3. **Edit**: click a workflow's **Edit** to view/reorder/delete its recorded steps, add or
   remove parameters (a param can be a plain overridable value, or a `secret` reference
   resolved from the vault — never a value baked into the workflow itself), edit its
   **RunPolicy** (what it's allowed to do with no one watching), and enable scheduling.
4. **Schedule**: in the same editor, turn on **Enable scheduling** and choose **Every N
   minutes** or **Daily at a time** — the workflow then runs on its own, on a
   non-active managed tab, with no side panel or foreground tab needed.
5. **Unattended safety.** A workflow only ever does, unattended, what its own `RunPolicy`
   pre-authorizes: an allow-list of tool ids/origins, whether a state-changing step (a
   purchase, a delete, a submit) may run with no one to confirm it, and optional step/
   daily-run caps. Self-heal can retarget a broken step to keep the workflow working, but
   it can **never** expand what the workflow is authorized to do — a healed fix that would
   be state-changing always stops the run and asks (if attended) or hard-stops outright
   with a notification (if unattended), regardless of what the recorded steps themselves
   are pre-authorized for.

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
- **Every tool call — MCP, WebMCP, or a browser action — passes through the identical
  gate**: risk classification, per-site policy, alignment critic, confirmation. No tool
  is ever auto-trusted; a newly discovered MCP/WebMCP tool starts denied until reviewed.
- **A workflow's `RunPolicy` is a pre-authorization, never something a run or a self-heal
  can expand.** A healed (LLM-proposed) fix is always held to a stricter bar than a
  recorded step: a state-changing heal always needs a human's confirmation when attended,
  and always hard-stops — never auto-applies — when unattended, no matter what the
  workflow itself is authorized to do unattended for its own recorded steps.
- All of the above is exercised by an end-to-end security test suite (indirect
  prompt-injection fixtures, a "compromised navigator" worst case, hostile tool
  descriptions attempting the same, and an unattended background workflow run facing
  the same worst-case injection) that runs in CI — see `apps/extension/README.md`'s
  E2E/security sections and `docs/adr/0022-security-test-suite.md`/
  `docs/adr/0040-tool-use-evals-and-security-suite.md`/
  `docs/adr/0054-workflow-evals-security-suite.md`.

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
  `packages/perception`, `packages/llm`, `packages/mcp`, `packages/shared`) are pure, framework-agnostic,
  and each has its own `README.md`.

## License

MIT — see [LICENSE](LICENSE).

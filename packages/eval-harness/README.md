# @aegis/eval-harness

Shared infrastructure for driving the real, built extension against local fixture pages
with a local fake-model server standing in for a real LLM provider. Extracted so
`apps/extension`'s Playwright E2E specs (#31, #32) and `evals/`'s reliability runner (#33)
don't maintain two copies of the same "load the extension, seed its config, serve
fixtures, drive a task deterministically" plumbing.

- `launchExtension(extensionPath)` — loads an unpacked MV3 extension (e.g.
  `apps/extension/.output/chrome-mv3`) into a headed, persistent Chromium context.
  Unpacked extension loading and `chrome.debugger` both need a real window, not the
  headless shell.
- `startFakeModelServer(respond)` — a local HTTP server implementing just enough of the
  OpenAI chat-completions wire format (`POST /chat/completions`) for
  `@ai-sdk/openai-compatible` to parse. `respond` is a `FakeModelResponder`: given the
  system prompt (which role — planner/navigator/verifier/critic — is calling, by its
  distinct system prompt text), the user prompt, and a per-role call index, return the
  scripted JSON response text.
- `startStaticServer(fixturesDir)` — serves local fixture HTML over real HTTP (the agent
  navigates a `chrome.tabs` tab to these, not a Playwright-controlled page).
- `seedModelRoutingConfig(worker, modelBaseUrl)` — writes a `ModelRoutingConfig` pointing
  every agent role at the fake model server directly into `chrome.storage.local`, via the
  background service worker.
- `findRef(prompt, nameSubstring)` — extracts a real `ElementRef` out of the actual
  "Available elements" list in a navigator/planner prompt, so a scripted response never
  hardcodes a ref (refs are assigned by the real perception aggregator at runtime).
- `scenarios/*` + `fixtures/*.html` — the versioned task set itself: `research-and-extract`,
  `compare-and-summarize`, `authenticated-read` (read-only), `form-fill-confirmation`
  (the confirmation-gated safety-path case, #32), and `injected-purchase-attempt`/
  `injected-navigate-attempt` (indirect-prompt-injection safety-path cases, #34) — the
  last three are E2E-only, not part of `evals/`'s reliability task set (they measure
  whether an unsafe action was correctly _blocked_, not whether a task was completed
  reliably).

Depends on `playwright` (the core library, not `@playwright/test`) so it's usable from a
plain CLI script (`evals/`), not just inside a Playwright test file.

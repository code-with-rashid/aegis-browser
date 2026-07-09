import {
  AUTHENTICATED_READ_EXPECTED_SUMMARY,
  AUTHENTICATED_READ_FIXTURE,
  AUTHENTICATED_READ_TASK,
  COMPARE_AND_SUMMARIZE_EXPECTED_SUMMARY,
  COMPARE_AND_SUMMARIZE_FIXTURE,
  COMPARE_AND_SUMMARIZE_TASK,
  createAuthenticatedReadResponder,
  createCompareAndSummarizeResponder,
  createResearchAndExtractResponder,
  FIXTURES_DIR,
  launchExtension,
  RESEARCH_AND_EXTRACT_EXPECTED_SUMMARY,
  RESEARCH_AND_EXTRACT_FIXTURE,
  RESEARCH_AND_EXTRACT_TASK,
  seedModelRoutingConfig,
  startFakeModelServer,
  startStaticServer,
} from '@aegis/eval-harness';
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, '../.output/chrome-mv3');

/**
 * Proves the core read-only agent loop end-to-end (#31): the real built extension,
 * loaded unpacked into a real Chromium window, running its real background composition
 * root (`RunManager` -> `buildLoopServices` -> the real XState loop, CDP perception, and
 * CDP action executors) against real fixture pages — with a local HTTP server standing
 * in for the LLM provider (`ModelRoutingConfig` seeded to point at it) so the run is
 * deterministic and needs no API key.
 *
 * Every scenario here only ever proposes `read`/`input`-risk actions (extract/click/
 * input_text with names that don't trip `STATE_CHANGING_KEYWORDS`), so the policy engine
 * always resolves `allow` and the confirmation gate never engages — genuinely read-only,
 * matching this issue's scope (a confirmation-gated task is #32). The fixtures/scenarios
 * themselves live in `@aegis/eval-harness`, shared with `evals/`'s reliability runner
 * (#33) so both consume the exact same versioned task set.
 */
const SCENARIOS = [
  {
    name: 'research & extract',
    fixture: RESEARCH_AND_EXTRACT_FIXTURE,
    task: RESEARCH_AND_EXTRACT_TASK,
    expectedSummary: RESEARCH_AND_EXTRACT_EXPECTED_SUMMARY,
    createResponder: createResearchAndExtractResponder,
  },
  {
    name: 'compare & summarize',
    fixture: COMPARE_AND_SUMMARIZE_FIXTURE,
    task: COMPARE_AND_SUMMARIZE_TASK,
    expectedSummary: COMPARE_AND_SUMMARIZE_EXPECTED_SUMMARY,
    createResponder: createCompareAndSummarizeResponder,
  },
  {
    name: 'authenticated read',
    fixture: AUTHENTICATED_READ_FIXTURE,
    task: AUTHENTICATED_READ_TASK,
    expectedSummary: AUTHENTICATED_READ_EXPECTED_SUMMARY,
    createResponder: createAuthenticatedReadResponder,
  },
];

for (const scenario of SCENARIOS) {
  test(scenario.name, async () => {
    const staticServer = await startStaticServer(FIXTURES_DIR);
    const modelServer = await startFakeModelServer(scenario.createResponder());
    const extension = await launchExtension(EXTENSION_PATH);

    try {
      await seedModelRoutingConfig(extension.serviceWorker, modelServer.baseUrl);

      const fixturePage = await extension.context.newPage();
      await fixturePage.goto(`${staticServer.baseUrl}/${scenario.fixture}`);

      const sidePanelPage = await extension.context.newPage();
      await sidePanelPage.goto(`chrome-extension://${extension.extensionId}/sidepanel.html`);

      // `chrome.tabs.query({active: true})` (how the side panel finds which tab to run
      // against) must resolve to the fixture tab, not the side-panel-loaded-as-a-tab
      // itself — re-assert it as the active tab right before Start, since opening the
      // side panel page may have stolen foreground focus.
      await fixturePage.bringToFront();

      await sidePanelPage.getByPlaceholder('What should Aegis do?').fill(scenario.task);
      await sidePanelPage.getByRole('button', { name: 'Start' }).click();

      await expect(sidePanelPage.getByText('Done', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        sidePanelPage.getByText(scenario.expectedSummary, { exact: false }),
      ).toBeVisible();
    } finally {
      await extension.close();
      await modelServer.close();
      await staticServer.close();
    }
  });
}

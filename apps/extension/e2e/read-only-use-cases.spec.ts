import { expect, test } from '@playwright/test';

import { launchExtension } from './extension-context';
import { startFakeModelServer } from './fake-model-server';
import { seedModelRoutingConfig } from './seed-storage';
import {
  AUTHENTICATED_READ_EXPECTED_SUMMARY,
  AUTHENTICATED_READ_TASK,
  createAuthenticatedReadResponder,
} from './scenarios/authenticated-read';
import {
  COMPARE_AND_SUMMARIZE_EXPECTED_SUMMARY,
  COMPARE_AND_SUMMARIZE_TASK,
  createCompareAndSummarizeResponder,
} from './scenarios/compare-and-summarize';
import {
  createResearchAndExtractResponder,
  RESEARCH_AND_EXTRACT_EXPECTED_SUMMARY,
  RESEARCH_AND_EXTRACT_TASK,
} from './scenarios/research-and-extract';
import { startStaticServer } from './static-server';

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
 * matching this issue's scope (a confirmation-gated task is #32).
 */
const SCENARIOS = [
  {
    name: 'research & extract',
    fixture: 'research.html',
    task: RESEARCH_AND_EXTRACT_TASK,
    expectedSummary: RESEARCH_AND_EXTRACT_EXPECTED_SUMMARY,
    createResponder: createResearchAndExtractResponder,
  },
  {
    name: 'compare & summarize',
    fixture: 'compare.html',
    task: COMPARE_AND_SUMMARIZE_TASK,
    expectedSummary: COMPARE_AND_SUMMARIZE_EXPECTED_SUMMARY,
    createResponder: createCompareAndSummarizeResponder,
  },
  {
    name: 'authenticated read',
    fixture: 'gated.html',
    task: AUTHENTICATED_READ_TASK,
    expectedSummary: AUTHENTICATED_READ_EXPECTED_SUMMARY,
    createResponder: createAuthenticatedReadResponder,
  },
];

for (const scenario of SCENARIOS) {
  test(scenario.name, async () => {
    const staticServer = await startStaticServer();
    const modelServer = await startFakeModelServer(scenario.createResponder());
    const extension = await launchExtension();

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

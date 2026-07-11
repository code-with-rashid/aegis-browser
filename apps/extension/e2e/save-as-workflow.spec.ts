import {
  createResearchAndExtractResponder,
  FIXTURES_DIR,
  launchExtension,
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
 * Proves the "record" half of Phase 3's own promise end-to-end (#121): a completed side-
 * panel run can actually become a reusable `@aegis/workflows` `Workflow`, closing a real
 * gap left open since #109 (`docs/adr/0043-run-recorder.md` deferred this to "whichever
 * later issue wires a 'Save as workflow' UI action" — no earlier Phase 3 issue did).
 */
test('a completed run can be saved as a workflow and shows up in the options page', async () => {
  const staticServer = await startStaticServer(FIXTURES_DIR);
  const modelServer = await startFakeModelServer(createResearchAndExtractResponder());
  const extension = await launchExtension(EXTENSION_PATH);

  try {
    await seedModelRoutingConfig(extension.serviceWorker, modelServer.baseUrl);

    const fixturePage = await extension.context.newPage();
    await fixturePage.goto(`${staticServer.baseUrl}/${RESEARCH_AND_EXTRACT_FIXTURE}`);

    const sidePanelPage = await extension.context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extension.extensionId}/sidepanel.html`);
    await fixturePage.bringToFront();

    await sidePanelPage.getByPlaceholder('What should Aegis do?').fill(RESEARCH_AND_EXTRACT_TASK);
    await sidePanelPage.getByRole('button', { name: 'Start' }).click();

    await expect(sidePanelPage.getByText('Done', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await sidePanelPage.getByPlaceholder('Workflow name').fill('Research the page');
    await sidePanelPage.getByRole('button', { name: 'Save as workflow' }).click();
    await expect(sidePanelPage.getByText(/Saved as a workflow/)).toBeVisible();

    const optionsPage = await extension.context.newPage();
    await optionsPage.goto(`chrome-extension://${extension.extensionId}/options.html`);
    await optionsPage.getByRole('button', { name: 'Workflows' }).click();

    await expect(optionsPage.getByText('Research the page')).toBeVisible();
  } finally {
    await extension.close();
    await modelServer.close();
    await staticServer.close();
  }
});

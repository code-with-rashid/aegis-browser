import {
  createFormFillConfirmationResponder,
  FIXTURES_DIR,
  FORM_FILL_CONFIRMATION_FIXTURE,
  FORM_FILL_CONFIRMATION_TASK,
  launchExtension,
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
 * Proves the safety path (#32): a state-changing action (a "Buy Now" click — its
 * accessible name matches `STATE_CHANGING_KEYWORDS`, elevating it to `state_changing`
 * risk) must pause in `confirming` rather than run, and rejecting it must replan without
 * ever having run it. This is the scenario ADR 0019 flagged as blocked until
 * `background/policy-service.ts` actually threads perception-derived element names into
 * `PolicyEngine.evaluate` — fixed as part of this issue.
 */
test('form-fill task pauses at a state-changing click, and reject never lets it run', async () => {
  const staticServer = await startStaticServer(FIXTURES_DIR);
  const modelServer = await startFakeModelServer(createFormFillConfirmationResponder());
  const extension = await launchExtension(EXTENSION_PATH);

  try {
    await seedModelRoutingConfig(extension.serviceWorker, modelServer.baseUrl);

    const fixturePage = await extension.context.newPage();
    await fixturePage.goto(`${staticServer.baseUrl}/${FORM_FILL_CONFIRMATION_FIXTURE}`);

    const sidePanelPage = await extension.context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extension.extensionId}/sidepanel.html`);

    await fixturePage.bringToFront();

    await sidePanelPage.getByPlaceholder('What should Aegis do?').fill(FORM_FILL_CONFIRMATION_TASK);
    await sidePanelPage.getByRole('button', { name: 'Start' }).click();

    // Gate fires: the confirmation dialog appears with a preview of the pending click.
    await expect(sidePanelPage.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
    await expect(sidePanelPage.getByText('Click "Buy Now"')).toBeVisible();

    // Unauthorized submit impossible: the purchase has NOT happened while awaiting a decision.
    await expect(fixturePage.locator('#purchased')).toBeHidden();

    // Reject -> replan.
    await sidePanelPage.getByRole('button', { name: 'Reject' }).click();

    await expect(sidePanelPage.getByText('Done', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(sidePanelPage.getByText('Replans: 1', { exact: false })).toBeVisible();
    await expect(sidePanelPage.getByText('not approved', { exact: false })).toBeVisible();

    // The click was never actually run, even after the loop finished.
    await expect(fixturePage.locator('#purchased')).toBeHidden();
  } finally {
    await extension.close();
    await modelServer.close();
    await staticServer.close();
  }
});

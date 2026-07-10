import {
  createWebMcpShippingFallbackResponder,
  createWebMcpShippingResponder,
  FIXTURES_DIR,
  launchExtension,
  seedModelRoutingConfig,
  startFakeModelServer,
  startStaticServer,
  WEBMCP_SHIPPING_EXPECTED_SUMMARY,
  WEBMCP_SHIPPING_FALLBACK_FIXTURE,
  WEBMCP_SHIPPING_FIXTURE,
  WEBMCP_SHIPPING_TASK,
} from '@aegis/eval-harness';
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, '../.output/chrome-mv3');

/**
 * Proves the WebMCP fast-path end to end (#88): the real built extension, its real
 * content scripts (`webmcp-page-bridge.content.ts`/`webmcp-relay.content.ts`), and its
 * real background wiring (`webmcp-tab-bridge.ts` -> `buildLoopServices`) against a real
 * fixture page declaring a live `document.modelContext` tool — not a stand-in for the
 * bridge, the actual thing. `webmcp-shipping.html` and `webmcp-shipping-fallback.html`
 * are the identical page except for that one declaration, so the only variable between
 * the two scenarios below is whether a WebMCP tool exists to prefer.
 */
test('completes the goal via the declared WebMCP tool in one step, with savings visible in the trace', async () => {
  const staticServer = await startStaticServer(FIXTURES_DIR);
  const modelServer = await startFakeModelServer(createWebMcpShippingResponder());
  const extension = await launchExtension(EXTENSION_PATH);

  try {
    await seedModelRoutingConfig(extension.serviceWorker, modelServer.baseUrl);

    const fixturePage = await extension.context.newPage();
    await fixturePage.goto(`${staticServer.baseUrl}/${WEBMCP_SHIPPING_FIXTURE}`);

    const sidePanelPage = await extension.context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extension.extensionId}/sidepanel.html`);

    await fixturePage.bringToFront();

    await sidePanelPage.getByPlaceholder('What should Aegis do?').fill(WEBMCP_SHIPPING_TASK);
    await sidePanelPage.getByRole('button', { name: 'Start' }).click();

    await expect(sidePanelPage.getByText('Done', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      sidePanelPage.getByText(WEBMCP_SHIPPING_EXPECTED_SUMMARY, { exact: false }),
    ).toBeVisible();

    // One acting cycle — the tool covered the whole sub-goal directly.
    await expect(sidePanelPage.getByText('Steps: 1', { exact: false })).toBeVisible();

    // The trace shows the tool call itself and the savings estimate (#88).
    await expect(
      sidePanelPage.getByText('web.get_shipping_estimate', { exact: false }),
    ).toBeVisible();
    await expect(sidePanelPage.getByText('DOM steps saved', { exact: false })).toBeVisible();

    // The calculator UI was never touched.
    await expect(fixturePage.locator('#destination')).toHaveValue('');
  } finally {
    await extension.close();
    await modelServer.close();
    await staticServer.close();
  }
});

test('falls back to the calculator UI when no WebMCP tool is declared, and still completes the goal', async () => {
  const staticServer = await startStaticServer(FIXTURES_DIR);
  const modelServer = await startFakeModelServer(createWebMcpShippingFallbackResponder());
  const extension = await launchExtension(EXTENSION_PATH);

  try {
    await seedModelRoutingConfig(extension.serviceWorker, modelServer.baseUrl);

    const fixturePage = await extension.context.newPage();
    await fixturePage.goto(`${staticServer.baseUrl}/${WEBMCP_SHIPPING_FALLBACK_FIXTURE}`);

    const sidePanelPage = await extension.context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extension.extensionId}/sidepanel.html`);

    await fixturePage.bringToFront();

    await sidePanelPage.getByPlaceholder('What should Aegis do?').fill(WEBMCP_SHIPPING_TASK);
    await sidePanelPage.getByRole('button', { name: 'Start' }).click();

    await expect(sidePanelPage.getByText('Done', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      sidePanelPage.getByText(WEBMCP_SHIPPING_EXPECTED_SUMMARY, { exact: false }),
    ).toBeVisible();

    // Two acting cycles — the calculator UI took a select + click, then a read.
    await expect(sidePanelPage.getByText('Steps: 2', { exact: false })).toBeVisible();

    // The calculator UI was actually used this time.
    await expect(fixturePage.locator('#destination')).toHaveValue('Freedonia');
  } finally {
    await extension.close();
    await modelServer.close();
    await staticServer.close();
  }
});

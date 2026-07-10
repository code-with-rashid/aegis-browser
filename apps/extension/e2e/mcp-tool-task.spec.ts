import {
  createMcpToolConfirmationResponder,
  createMcpToolTaskResponder,
  FIXTURES_DIR,
  launchExtension,
  MCP_TOOL_CONFIRMATION_TASK,
  MCP_TOOL_CONFIRMATION_TOOL_ID,
  MCP_TOOL_ID,
  MCP_TOOL_TASK,
  MCP_TOOL_TASK_EXPECTED_SUMMARY,
  MCP_TOOL_TASK_FIXTURE,
  seedMcpServer,
  seedModelRoutingConfig,
  startFakeModelServer,
  startStaticServer,
} from '@aegis/eval-harness';
import { startMockMcpServer, textResult } from '@aegis/mcp/testing';
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, '../.output/chrome-mv3');

/**
 * Proves tool-use end to end against a real MCP server (#91): the real built extension,
 * its real background `McpClient`, connected over real Streamable HTTP to a real local
 * `MockMcpServer` — not a stand-in for the MCP round trip, the actual thing. The task
 * needs no page interaction at all, since the tool answers it directly.
 */
test('completes the goal via a real MCP tool, end to end', async () => {
  const mcpServer = await startMockMcpServer([
    {
      name: 'get_forecast',
      description: 'Looks up the weather forecast for a city.',
      annotations: { readOnlyHint: true },
      handler: () => textResult(MCP_TOOL_TASK_EXPECTED_SUMMARY),
    },
  ]);
  const staticServer = await startStaticServer(FIXTURES_DIR);
  const modelServer = await startFakeModelServer(createMcpToolTaskResponder());
  const extension = await launchExtension(EXTENSION_PATH);

  try {
    await seedModelRoutingConfig(extension.serviceWorker, modelServer.baseUrl);
    await seedMcpServer(extension.serviceWorker, { url: mcpServer.url, name: 'weather' }, [
      MCP_TOOL_ID,
    ]);

    const fixturePage = await extension.context.newPage();
    await fixturePage.goto(`${staticServer.baseUrl}/${MCP_TOOL_TASK_FIXTURE}`);

    const sidePanelPage = await extension.context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extension.extensionId}/sidepanel.html`);

    await fixturePage.bringToFront();

    await sidePanelPage.getByPlaceholder('What should Aegis do?').fill(MCP_TOOL_TASK);
    await sidePanelPage.getByRole('button', { name: 'Start' }).click();

    await expect(sidePanelPage.getByText('Done', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      sidePanelPage.getByText(MCP_TOOL_TASK_EXPECTED_SUMMARY, { exact: false }),
    ).toBeVisible();

    // One acting cycle — the tool covered the whole sub-goal directly.
    await expect(sidePanelPage.getByText('Steps: 1', { exact: false })).toBeVisible();

    // The trace shows the real MCP tool call itself, distinguished by source (#90).
    await expect(sidePanelPage.getByText(MCP_TOOL_ID, { exact: false })).toBeVisible();
  } finally {
    await extension.close();
    await modelServer.close();
    await staticServer.close();
    await mcpServer.close();
  }
});

/**
 * Proves the confirmation gate genuinely blocks a state-changing MCP tool call (#91's
 * safety criterion): unlike a browser action, an MCP tool has no page DOM to check, so the
 * "real state, not just self-reported status" proof (`docs/adr/0020-e2e-confirmation-gated-task.md`'s
 * convention) is the mock server's own call count — a real, external side effect the loop
 * cannot fake by merely reporting a status.
 */
test('a state-changing MCP tool call requires confirmation before it genuinely runs', async () => {
  let orderCalls = 0;
  const mcpServer = await startMockMcpServer([
    {
      name: 'place_order',
      description: 'Places an order.',
      handler: () => {
        orderCalls += 1;
        return textResult('Order placed');
      },
    },
  ]);
  const staticServer = await startStaticServer(FIXTURES_DIR);
  const modelServer = await startFakeModelServer(createMcpToolConfirmationResponder());
  const extension = await launchExtension(EXTENSION_PATH);

  try {
    await seedModelRoutingConfig(extension.serviceWorker, modelServer.baseUrl);
    await seedMcpServer(extension.serviceWorker, { url: mcpServer.url, name: 'shop' }, [
      MCP_TOOL_CONFIRMATION_TOOL_ID,
    ]);

    const fixturePage = await extension.context.newPage();
    await fixturePage.goto(`${staticServer.baseUrl}/${MCP_TOOL_TASK_FIXTURE}`);

    const sidePanelPage = await extension.context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extension.extensionId}/sidepanel.html`);

    await fixturePage.bringToFront();

    await sidePanelPage.getByPlaceholder('What should Aegis do?').fill(MCP_TOOL_CONFIRMATION_TASK);
    await sidePanelPage.getByRole('button', { name: 'Start' }).click();

    // Gate fires: the confirmation dialog previews the pending, non-browser tool call (#90).
    await expect(sidePanelPage.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
    await expect(
      sidePanelPage.getByText(`Call tool "${MCP_TOOL_CONFIRMATION_TOOL_ID}"`, { exact: false }),
    ).toBeVisible();
    await expect(sidePanelPage.getByText('mcp', { exact: true })).toBeVisible();

    // The real MCP server has NOT been called while awaiting a decision.
    expect(orderCalls).toBe(0);

    await sidePanelPage.getByRole('button', { name: 'Approve' }).click();

    await expect(sidePanelPage.getByText('Done', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // Only now has the real server actually received the call.
    expect(orderCalls).toBe(1);
  } finally {
    await extension.close();
    await modelServer.close();
    await staticServer.close();
    await mcpServer.close();
  }
});

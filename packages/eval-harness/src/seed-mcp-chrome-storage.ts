import type { Worker } from 'playwright';

const MCP_SERVERS_STORAGE_KEY = 'mcp-servers';
const MCP_TOOL_POLICIES_STORAGE_KEY = 'mcp-tool-policies';

export interface McpServerSeed {
  readonly url: string;
  readonly name: string;
}

/**
 * Seeds `chrome.storage.local` with one enabled {@link McpServerSeed} and an `allow`
 * policy for every id in `toolIds` — directly through the background service worker's own
 * `chrome.storage` access, bypassing `@aegis/mcp`'s `McpServerStore`/`McpToolPolicyStore`
 * entirely (this runs from outside the extension's module graph, the same reason
 * `seedModelRoutingConfig` exists). Storage keys/shapes must match
 * `packages/mcp/src/config/mcp-server-store.ts`/`policy/mcp-tool-policy-store.ts` exactly.
 * Every listed tool is allowed — `@aegis/mcp`'s admission gate (#86) denies by default any
 * tool id never explicitly allowed, so without this the tool would never register at all.
 */
export async function seedMcpServer(
  worker: Worker,
  server: McpServerSeed,
  toolIds: readonly string[],
): Promise<void> {
  const serverConfig = { url: server.url, name: server.name, authHeaders: [], enabled: true };
  const toolPolicies = Object.fromEntries(
    toolIds.map((toolId) => [toolId, { toolId, mode: 'allow' as const }]),
  );

  await worker.evaluate(
    ([serversKey, serversValue, policiesKey, policiesValue]) =>
      chrome.storage.local.set({ [serversKey]: serversValue, [policiesKey]: policiesValue }),
    [
      MCP_SERVERS_STORAGE_KEY,
      { [server.url]: serverConfig },
      MCP_TOOL_POLICIES_STORAGE_KEY,
      toolPolicies,
    ] as const,
  );
}

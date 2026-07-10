import {
  buildMcpToolId,
  inferMcpToolRisk,
  testMcpServerConnection,
  toIdSegment,
  type McpServerConnectionConfig,
  type McpServerStore,
  type McpToolDescriptor,
  type McpToolPolicyMode,
  type McpToolPolicyStore,
  type SecretResolver,
  type WebMcpSettingsStore,
} from '@aegis/mcp';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

import { EMPTY_MCP_SERVER_DRAFT, toMcpServerConfig, type McpServerDraft } from './mcp-server-draft';

export interface McpToolsPanelProps {
  readonly serverStore: McpServerStore;
  readonly policyStore: McpToolPolicyStore;
  readonly webMcpSettingsStore: WebMcpSettingsStore;
  /** Resolves an auth header's `secretName` for the "Discover tools" connection test — the options page's own vault, unlockable from the Secrets tab (a live task's own vault instance is a separate process; see `docs/adr/0037-mcp-tools-management-ui.md`). */
  readonly resolveSecret: SecretResolver;
}

type RowStatus = { status: 'idle' } | { status: 'saving' } | { status: 'error'; message: string };

type DiscoverState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'success'; tools: readonly McpToolDescriptor[] }
  | { status: 'failure'; message: string };

const POLICY_MODE_OPTIONS: readonly { mode: McpToolPolicyMode; label: string }[] = [
  { mode: 'allow', label: 'Allow' },
  { mode: 'deny', label: 'Deny' },
];

/**
 * Manages configured MCP servers (add/enable/disable/remove, #84), lets a user discover a
 * server's tools and their input schemas (#85), set per-tool allow/deny (#86), and toggle
 * the WebMCP fast-path globally (#87/#88). Every change writes straight to the same
 * storage `buildLoopServices` reads fresh on every task start — no extension reload
 * needed for it to take effect (`docs/adr/0037-mcp-tools-management-ui.md`).
 */
export function McpToolsPanel({
  serverStore,
  policyStore,
  webMcpSettingsStore,
  resolveSecret,
}: McpToolsPanelProps): React.JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const [servers, setServers] = useState<readonly McpServerConnectionConfig[]>([]);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [draft, setDraft] = useState<McpServerDraft>(EMPTY_MCP_SERVER_DRAFT);
  const [addError, setAddError] = useState<string | undefined>(undefined);
  const [discovered, setDiscovered] = useState<Record<string, DiscoverState>>({});
  const [toolPolicies, setToolPolicies] = useState<Record<string, McpToolPolicyMode | undefined>>(
    {},
  );
  const [webMcpEnabled, setWebMcpEnabled] = useState(true);
  const [webMcpSaving, setWebMcpSaving] = useState(false);

  async function refreshServers(): Promise<void> {
    const result = await serverStore.listServers();
    if (result.ok) {
      setServers([...result.value].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  useEffect(() => {
    Promise.all([serverStore.listServers(), webMcpSettingsStore.getSettings()])
      .then(([serversResult, settingsResult]) => {
        if (serversResult.ok) {
          setServers([...serversResult.value].sort((a, b) => a.name.localeCompare(b.name)));
        }
        if (settingsResult.ok) {
          setWebMcpEnabled(settingsResult.value.enabled);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setLoaded(true);
      });
  }, [serverStore, webMcpSettingsStore]);

  async function handleToggleWebMcp(): Promise<void> {
    const next = !webMcpEnabled;
    setWebMcpSaving(true);
    const result = await webMcpSettingsStore.setSettings({ enabled: next });
    if (result.ok) {
      setWebMcpEnabled(next);
    }
    setWebMcpSaving(false);
  }

  async function updateServer(config: McpServerConnectionConfig): Promise<void> {
    setRowStatus((current) => ({ ...current, [config.url]: { status: 'saving' } }));
    const result = await serverStore.saveServer(config);
    if (result.ok) {
      setRowStatus((current) => ({ ...current, [config.url]: { status: 'idle' } }));
      await refreshServers();
    } else {
      setRowStatus((current) => ({
        ...current,
        [config.url]: { status: 'error', message: result.error.message },
      }));
    }
  }

  async function removeServer(url: string): Promise<void> {
    setRowStatus((current) => ({ ...current, [url]: { status: 'saving' } }));
    const result = await serverStore.removeServer(url);
    if (result.ok) {
      await refreshServers();
    } else {
      setRowStatus((current) => ({
        ...current,
        [url]: { status: 'error', message: result.error.message },
      }));
    }
  }

  async function handleAdd(): Promise<void> {
    const config = toMcpServerConfig(draft);
    if (config === undefined) {
      setAddError('Enter a valid URL and a name.');
      return;
    }
    if (servers.some((server) => server.url === config.url)) {
      setAddError('This server is already configured — edit it below instead.');
      return;
    }
    setAddError(undefined);
    const result = await serverStore.saveServer(config);
    if (result.ok) {
      setDraft(EMPTY_MCP_SERVER_DRAFT);
      await refreshServers();
    } else {
      setAddError(result.error.message);
    }
  }

  async function handleDiscover(config: McpServerConnectionConfig): Promise<void> {
    setDiscovered((current) => ({ ...current, [config.url]: { status: 'testing' } }));
    const result = await testMcpServerConnection(config, resolveSecret);
    if (!result.ok) {
      setDiscovered((current) => ({
        ...current,
        [config.url]: { status: 'failure', message: result.error.message },
      }));
      return;
    }
    setDiscovered((current) => ({
      ...current,
      [config.url]: { status: 'success', tools: result.value },
    }));

    const serverIdSegment = toIdSegment(config.name);
    const policies = await Promise.all(
      result.value.map(async (tool) => {
        const toolId = buildMcpToolId(serverIdSegment, tool.name);
        const policyResult = await policyStore.getPolicy(toolId);
        return [toolId, policyResult.ok ? policyResult.value?.mode : undefined] as const;
      }),
    );
    setToolPolicies((current) => ({ ...current, ...Object.fromEntries(policies) }));
  }

  async function handleSetToolPolicy(toolId: string, mode: McpToolPolicyMode): Promise<void> {
    const result = await policyStore.setPolicy({ toolId, mode });
    if (result.ok) {
      setToolPolicies((current) => ({ ...current, [toolId]: mode }));
    }
  }

  if (!loaded) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-md border border-border p-3">
        <h2 className="text-lg font-semibold">WebMCP</h2>
        <p className="text-sm text-muted-foreground">
          When on, a page&apos;s own declared tools (if any) are available to the agent, preferred
          over clicking through the page. Turning this off never registers a WebMCP tool, on any
          page, regardless of what it declares.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={webMcpEnabled}
            disabled={webMcpSaving}
            onChange={() => void handleToggleWebMcp()}
          />
          Use WebMCP tools when a page declares them
        </label>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">MCP servers</h2>
        {servers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No MCP servers configured yet.</p>
        ) : (
          <ul className="space-y-2">
            {servers.map((server) => {
              const status = rowStatus[server.url] ?? { status: 'idle' };
              const discover = discovered[server.url] ?? { status: 'idle' };
              return (
                <li key={server.url} className="space-y-2 rounded-md border border-border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {server.name}
                      <span className="ml-2 truncate text-xs font-normal text-muted-foreground">
                        {server.url}
                      </span>
                    </span>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        onChange={(event) => {
                          void updateServer({ ...server, enabled: event.target.checked });
                        }}
                      />
                      Enabled
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={discover.status === 'testing'}
                      onClick={() => void handleDiscover(server)}
                    >
                      {discover.status === 'testing' ? 'Discovering…' : 'Discover tools'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={status.status === 'saving'}
                      onClick={() => void removeServer(server.url)}
                    >
                      Remove
                    </Button>
                  </div>
                  {status.status === 'error' ? (
                    <p className="text-xs text-red-600">{status.message}</p>
                  ) : null}
                  {discover.status === 'failure' ? (
                    <p className="text-xs text-red-600">{discover.message}</p>
                  ) : null}
                  {discover.status === 'success' ? (
                    discover.tools.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        This server declares no tools.
                      </p>
                    ) : (
                      <ul className="space-y-2 border-t border-border pt-2">
                        {discover.tools.map((tool) => {
                          const toolId = buildMcpToolId(toIdSegment(server.name), tool.name);
                          const mode = toolPolicies[toolId];
                          return (
                            <li key={toolId} className="space-y-1 rounded bg-muted p-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="min-w-0 flex-1 font-medium">{tool.name}</span>
                                <span className="text-muted-foreground">
                                  Risk: {inferMcpToolRisk(tool.annotations)}
                                </span>
                                <label className="flex items-center gap-1">
                                  {mode === undefined ? (
                                    <span className="text-amber-700">Pending review</span>
                                  ) : null}
                                  <select
                                    aria-label={`Permission for ${tool.name}`}
                                    className="rounded border border-border bg-background p-1"
                                    value={mode ?? ''}
                                    onChange={(event) => {
                                      void handleSetToolPolicy(
                                        toolId,
                                        event.target.value as McpToolPolicyMode,
                                      );
                                    }}
                                  >
                                    <option value="" disabled>
                                      Choose…
                                    </option>
                                    {POLICY_MODE_OPTIONS.map((option) => (
                                      <option key={option.mode} value={option.mode}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              {tool.description !== undefined ? (
                                <p className="text-muted-foreground">{tool.description}</p>
                              ) : null}
                              <pre className="overflow-auto rounded bg-background p-1">
                                {JSON.stringify(tool.inputSchema, null, 2)}
                              </pre>
                            </li>
                          );
                        })}
                      </ul>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-md border border-border p-3">
        <h3 className="text-sm font-medium">Add an MCP server</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-[10rem] flex-1 text-xs text-muted-foreground">
            Name
            <input
              className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
              placeholder="Weather Co"
              value={draft.name}
              onChange={(event) => {
                setDraft({ ...draft, name: event.target.value });
                setAddError(undefined);
              }}
            />
          </label>
          <label className="min-w-[14rem] flex-1 text-xs text-muted-foreground">
            URL
            <input
              className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
              placeholder="https://mcp.example.com/mcp"
              value={draft.url}
              onChange={(event) => {
                setDraft({ ...draft, url: event.target.value });
                setAddError(undefined);
              }}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-[10rem] flex-1 text-xs text-muted-foreground">
            Auth header name (optional)
            <input
              className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
              placeholder="Authorization"
              value={draft.authHeaderName}
              onChange={(event) => {
                setDraft({ ...draft, authHeaderName: event.target.value });
              }}
            />
          </label>
          <label className="min-w-[10rem] flex-1 text-xs text-muted-foreground">
            Vault secret name for that header
            <input
              className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
              placeholder="weather_api_token"
              value={draft.authHeaderSecretName}
              onChange={(event) => {
                setDraft({ ...draft, authHeaderSecretName: event.target.value });
              }}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => {
              setDraft({ ...draft, enabled: event.target.checked });
            }}
          />
          Enabled
        </label>
        <Button type="button" size="sm" onClick={() => void handleAdd()}>
          Add
        </Button>
        {addError !== undefined ? <p className="text-xs text-red-600">{addError}</p> : null}
      </section>
    </div>
  );
}

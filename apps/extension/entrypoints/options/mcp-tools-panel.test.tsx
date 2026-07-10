// @vitest-environment jsdom
import type {
  McpServerConnectionConfig,
  McpServerStore,
  McpToolPolicy,
  McpToolPolicyStore,
  WebMcpSettings,
  WebMcpSettingsStore,
} from '@aegis/mcp';
import { textResult, startMockMcpServer, type MockMcpServer } from '@aegis/mcp/testing';
import { err, ok } from '@aegis/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { McpToolsPanel } from './mcp-tools-panel';

function createFakeServerStore(seed: readonly McpServerConnectionConfig[] = []): McpServerStore {
  const servers = new Map(seed.map((server) => [server.url, server]));
  return {
    getServer: (url) => Promise.resolve(ok(servers.get(url))),
    saveServer: (config) => {
      servers.set(config.url, config);
      return Promise.resolve(ok(undefined));
    },
    removeServer: (url) => {
      servers.delete(url);
      return Promise.resolve(ok(undefined));
    },
    listServers: () => Promise.resolve(ok([...servers.values()])),
  };
}

function createFakePolicyStore(seed: readonly McpToolPolicy[] = []): McpToolPolicyStore {
  const policies = new Map(seed.map((policy) => [policy.toolId, policy]));
  return {
    getPolicy: (toolId) => Promise.resolve(ok(policies.get(toolId))),
    setPolicy: (policy) => {
      policies.set(policy.toolId, policy);
      return Promise.resolve(ok(undefined));
    },
    removePolicy: (toolId) => {
      policies.delete(toolId);
      return Promise.resolve(ok(undefined));
    },
    listPolicies: () => Promise.resolve(ok([...policies.values()])),
  };
}

function createFakeWebMcpSettingsStore(
  initial: WebMcpSettings = { enabled: true },
): WebMcpSettingsStore {
  let settings = initial;
  return {
    getSettings: () => Promise.resolve(ok(settings)),
    setSettings: (next) => {
      settings = next;
      return Promise.resolve(ok(undefined));
    },
  };
}

const noSecrets = () => Promise.resolve(err({ message: 'no secrets in this test' }));

let mockMcpServer: MockMcpServer | undefined;

afterEach(async () => {
  if (mockMcpServer) {
    await mockMcpServer.close();
    mockMcpServer = undefined;
  }
});

describe('McpToolsPanel', () => {
  it('lists existing servers', async () => {
    const serverStore = createFakeServerStore([
      { url: 'https://mcp.example.com/mcp', name: 'Example', authHeaders: [], enabled: true },
    ]);
    render(
      <McpToolsPanel
        serverStore={serverStore}
        policyStore={createFakePolicyStore()}
        webMcpSettingsStore={createFakeWebMcpSettingsStore()}
        resolveSecret={noSecrets}
      />,
    );

    expect(await screen.findByText('Example')).toBeInTheDocument();
    expect(screen.getByText('https://mcp.example.com/mcp')).toBeInTheDocument();
  });

  it('adds a new MCP server', async () => {
    const serverStore = createFakeServerStore();
    const user = userEvent.setup();
    render(
      <McpToolsPanel
        serverStore={serverStore}
        policyStore={createFakePolicyStore()}
        webMcpSettingsStore={createFakeWebMcpSettingsStore()}
        resolveSecret={noSecrets}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No MCP servers configured yet.')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Name'), 'Example');
    await user.type(screen.getByLabelText('URL'), 'https://mcp.example.com/mcp');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Example')).toBeInTheDocument();
    const result = await serverStore.listServers();
    expect(result.ok && result.value).toEqual([
      { url: 'https://mcp.example.com/mcp', name: 'Example', authHeaders: [], enabled: true },
    ]);
  });

  it('rejects adding a server with an invalid URL', async () => {
    const serverStore = createFakeServerStore();
    const user = userEvent.setup();
    render(
      <McpToolsPanel
        serverStore={serverStore}
        policyStore={createFakePolicyStore()}
        webMcpSettingsStore={createFakeWebMcpSettingsStore()}
        resolveSecret={noSecrets}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No MCP servers configured yet.')).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText('Name'), 'Example');
    await user.type(screen.getByLabelText('URL'), 'not a url');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText(/Enter a valid URL/)).toBeInTheDocument();
    const result = await serverStore.listServers();
    expect(result.ok && result.value).toEqual([]);
  });

  it('toggling the enabled checkbox persists immediately', async () => {
    const serverStore = createFakeServerStore([
      { url: 'https://mcp.example.com/mcp', name: 'Example', authHeaders: [], enabled: true },
    ]);
    const user = userEvent.setup();
    render(
      <McpToolsPanel
        serverStore={serverStore}
        policyStore={createFakePolicyStore()}
        webMcpSettingsStore={createFakeWebMcpSettingsStore()}
        resolveSecret={noSecrets}
      />,
    );

    const row = (await screen.findByText('Example')).closest('li');
    if (row === null) {
      throw new Error('row not found');
    }
    await user.click(within(row).getByLabelText('Enabled'));

    await waitFor(async () => {
      const result = await serverStore.getServer('https://mcp.example.com/mcp');
      expect(result.ok && result.value?.enabled).toBe(false);
    });
  });

  it('removes a server', async () => {
    const serverStore = createFakeServerStore([
      { url: 'https://mcp.example.com/mcp', name: 'Example', authHeaders: [], enabled: true },
    ]);
    const user = userEvent.setup();
    render(
      <McpToolsPanel
        serverStore={serverStore}
        policyStore={createFakePolicyStore()}
        webMcpSettingsStore={createFakeWebMcpSettingsStore()}
        resolveSecret={noSecrets}
      />,
    );

    await screen.findByText('Example');
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByText('No MCP servers configured yet.')).toBeInTheDocument();
    });
  });

  it('discovers tools on a real MCP server and shows their input schema', async () => {
    mockMcpServer = await startMockMcpServer([
      {
        name: 'get_weather',
        description: 'Looks up the weather',
        inputSchema: {},
        handler: () => textResult('sunny'),
      },
    ]);
    const serverStore = createFakeServerStore([
      { url: mockMcpServer.url, name: 'Weather', authHeaders: [], enabled: true },
    ]);
    const user = userEvent.setup();
    render(
      <McpToolsPanel
        serverStore={serverStore}
        policyStore={createFakePolicyStore()}
        webMcpSettingsStore={createFakeWebMcpSettingsStore()}
        resolveSecret={noSecrets}
      />,
    );

    await screen.findByText('Weather');
    await user.click(screen.getByRole('button', { name: 'Discover tools' }));

    expect(await screen.findByText('get_weather')).toBeInTheDocument();
    expect(screen.getByText('Looks up the weather')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  it('setting a tool to Allow persists the policy immediately', async () => {
    mockMcpServer = await startMockMcpServer([
      { name: 'get_weather', inputSchema: {}, handler: () => textResult('sunny') },
    ]);
    const serverStore = createFakeServerStore([
      { url: mockMcpServer.url, name: 'Weather', authHeaders: [], enabled: true },
    ]);
    const policyStore = createFakePolicyStore();
    const user = userEvent.setup();
    render(
      <McpToolsPanel
        serverStore={serverStore}
        policyStore={policyStore}
        webMcpSettingsStore={createFakeWebMcpSettingsStore()}
        resolveSecret={noSecrets}
      />,
    );

    await screen.findByText('Weather');
    await user.click(screen.getByRole('button', { name: 'Discover tools' }));
    await screen.findByText('get_weather');

    await user.selectOptions(screen.getByLabelText('Permission for get_weather'), 'allow');

    await waitFor(async () => {
      const result = await policyStore.getPolicy('mcp.weather.get_weather');
      expect(result.ok && result.value?.mode).toBe('allow');
    });
  });

  it('toggling WebMCP off persists immediately', async () => {
    const settingsStore = createFakeWebMcpSettingsStore({ enabled: true });
    const user = userEvent.setup();
    render(
      <McpToolsPanel
        serverStore={createFakeServerStore()}
        policyStore={createFakePolicyStore()}
        webMcpSettingsStore={settingsStore}
        resolveSecret={noSecrets}
      />,
    );

    const checkbox = await screen.findByLabelText('Use WebMCP tools when a page declares them');
    expect(checkbox).toBeChecked();
    await user.click(checkbox);

    await waitFor(async () => {
      const result = await settingsStore.getSettings();
      expect(result.ok && result.value.enabled).toBe(false);
    });
  });

  it('shows a connection failure without crashing, and never renders a tool list', async () => {
    const serverStore = createFakeServerStore([
      { url: 'http://127.0.0.1:1/mcp', name: 'Unreachable', authHeaders: [], enabled: true },
    ]);
    const user = userEvent.setup();
    render(
      <McpToolsPanel
        serverStore={serverStore}
        policyStore={createFakePolicyStore()}
        webMcpSettingsStore={createFakeWebMcpSettingsStore()}
        resolveSecret={noSecrets}
      />,
    );

    await screen.findByText('Unreachable');
    await user.click(screen.getByRole('button', { name: 'Discover tools' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Discover tools' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Pending review')).not.toBeInTheDocument();
  });
});

import {
  createMcpServerStore,
  createMcpToolPolicyStore,
  createWebMcpSettingsStore,
} from '@aegis/mcp';
import { createPolicyStore, createSecretVault } from '@aegis/security';
import { createChromeStorageAdapter } from '@aegis/shared';
import { createWorkflowRunStore, createWorkflowStore } from '@aegis/workflows';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { connectToBackgroundWorkflowBridge } from '../../messaging/chrome-port';
import type {
  BackgroundToOptionsWorkflowMessage,
  OptionsToBackgroundWorkflowMessage,
} from '../../messaging/workflow-protocol';
import { McpToolsPanel } from './mcp-tools-panel';
import { ModelsAndKeysPanel } from './models-and-keys-panel';
import { PermissionsPanel } from './permissions-panel';
import { SecretVaultPanel } from './secret-vault-panel';
import { WorkflowLibraryPanel } from './workflow-library-panel';
import { createWorkflowRunTrigger } from './workflow-run-trigger';

const storage = createChromeStorageAdapter(chrome.storage.local);
const policyStore = createPolicyStore(storage);
const secretVault = createSecretVault(storage);
const mcpServerStore = createMcpServerStore(storage);
const mcpToolPolicyStore = createMcpToolPolicyStore(storage);
const webMcpSettingsStore = createWebMcpSettingsStore(storage);
const workflowStore = createWorkflowStore(storage);
const workflowRunStore = createWorkflowRunStore(storage);
const workflowRunTrigger = createWorkflowRunTrigger(
  connectToBackgroundWorkflowBridge<
    OptionsToBackgroundWorkflowMessage,
    BackgroundToOptionsWorkflowMessage
  >(),
);

type Tab = 'models' | 'permissions' | 'tools' | 'secrets' | 'workflows';

const TABS: readonly { tab: Tab; label: string }[] = [
  { tab: 'models', label: 'Models & Keys' },
  { tab: 'permissions', label: 'Permissions' },
  { tab: 'tools', label: 'Tools & MCP' },
  { tab: 'secrets', label: 'Secrets' },
  { tab: 'workflows', label: 'Workflows' },
];

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('models');

  return (
    <div className="mx-auto max-w-2xl p-6 text-foreground">
      <h1 className="text-xl font-semibold">Aegis Settings</h1>

      <nav className="mt-4 flex gap-2 border-b border-border">
        {TABS.map((entry) => (
          <button
            key={entry.tab}
            type="button"
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium',
              tab === entry.tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => {
              setTab(entry.tab);
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {tab === 'models' ? <ModelsAndKeysPanel storage={storage} /> : null}
        {tab === 'permissions' ? <PermissionsPanel store={policyStore} /> : null}
        {tab === 'tools' ? (
          <McpToolsPanel
            serverStore={mcpServerStore}
            policyStore={mcpToolPolicyStore}
            webMcpSettingsStore={webMcpSettingsStore}
            resolveSecret={(name) => secretVault.getSecret(name)}
          />
        ) : null}
        {tab === 'secrets' ? <SecretVaultPanel vault={secretVault} /> : null}
        {tab === 'workflows' ? (
          <WorkflowLibraryPanel
            workflowStore={workflowStore}
            runStore={workflowRunStore}
            runTrigger={workflowRunTrigger}
          />
        ) : null}
      </div>
    </div>
  );
}

import { createPolicyStore } from '@aegis/security';
import { createChromeStorageAdapter } from '@aegis/shared';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { ModelsAndKeysPanel } from './models-and-keys-panel';
import { PermissionsPanel } from './permissions-panel';

const storage = createChromeStorageAdapter(chrome.storage.local);
const policyStore = createPolicyStore(storage);

type Tab = 'models' | 'permissions';

const TABS: readonly { tab: Tab; label: string }[] = [
  { tab: 'models', label: 'Models & Keys' },
  { tab: 'permissions', label: 'Permissions' },
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
      </div>
    </div>
  );
}

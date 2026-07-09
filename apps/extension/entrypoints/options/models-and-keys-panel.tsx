import { loadModelRoutingConfig, saveModelRoutingConfig } from '@aegis/llm';
import type { AgentRole, ModelRoutingConfig, ProviderConfig } from '@aegis/llm';
import type { StoragePort } from '@aegis/shared';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

import { draftFromConfig, EMPTY_PROVIDER_DRAFT, toProviderConfig } from './provider-draft';
import type { ProviderDraft } from './provider-draft';
import { ProviderConfigForm } from './provider-config-form';
import { testProviderConnection } from './test-connection';

export interface ModelsAndKeysPanelProps {
  readonly storage: StoragePort;
}

const ROLES: readonly { role: AgentRole; label: string }[] = [
  { role: 'planner', label: 'Planner' },
  { role: 'navigator', label: 'Navigator' },
  { role: 'verifier', label: 'Verifier' },
  { role: 'critic', label: 'Critic' },
];

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'success' }
  | { status: 'failure'; message: string };

const IDLE_TEST_STATES: Readonly<Record<AgentRole, TestState>> = {
  planner: { status: 'idle' },
  navigator: { status: 'idle' },
  verifier: { status: 'idle' },
  critic: { status: 'idle' },
};

const EMPTY_DRAFTS: Readonly<Record<AgentRole, ProviderDraft>> = {
  planner: EMPTY_PROVIDER_DRAFT,
  navigator: EMPTY_PROVIDER_DRAFT,
  verifier: EMPTY_PROVIDER_DRAFT,
  critic: EMPTY_PROVIDER_DRAFT,
};

/** BYOK provider + key configuration per agent role, with a live connection test (#28). */
export function ModelsAndKeysPanel({ storage }: ModelsAndKeysPanelProps): React.JSX.Element {
  const [drafts, setDrafts] = useState<Record<AgentRole, ProviderDraft>>(EMPTY_DRAFTS);
  const [testStates, setTestStates] = useState<Record<AgentRole, TestState>>(IDLE_TEST_STATES);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadModelRoutingConfig(storage)
      .then((result) => {
        if (result.ok && result.value !== undefined) {
          const config = result.value;
          setDrafts({
            planner: draftFromConfig(config.planner.provider),
            navigator: draftFromConfig(config.navigator.provider),
            verifier: draftFromConfig(config.verifier.provider),
            critic: draftFromConfig(config.critic.provider),
          });
        }
      })
      .finally(() => {
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, [storage]);

  function updateDraft(role: AgentRole, draft: ProviderDraft): void {
    setDrafts((current) => ({ ...current, [role]: draft }));
    setTestStates((current) => ({ ...current, [role]: { status: 'idle' } }));
    setSaveState('idle');
  }

  async function handleTest(role: AgentRole): Promise<void> {
    const config = toProviderConfig(drafts[role]);
    if (config === undefined) {
      setTestStates((current) => ({
        ...current,
        [role]: { status: 'failure', message: 'Fill in all required fields first.' },
      }));
      return;
    }
    setTestStates((current) => ({ ...current, [role]: { status: 'testing' } }));
    const result = await testProviderConnection(config);
    setTestStates((current) => ({
      ...current,
      [role]: result.ok
        ? { status: 'success' }
        : { status: 'failure', message: result.error.message },
    }));
  }

  const configs = Object.fromEntries(
    ROLES.map(({ role }) => [role, toProviderConfig(drafts[role])]),
  ) as Record<AgentRole, ProviderConfig | undefined>;
  const allValid = ROLES.every(({ role }) => configs[role] !== undefined);

  async function handleSave(): Promise<void> {
    if (!allValid) {
      return;
    }
    setSaveState('saving');
    const config: ModelRoutingConfig = {
      planner: { provider: configs.planner! },
      navigator: { provider: configs.navigator! },
      verifier: { provider: configs.verifier! },
      critic: { provider: configs.critic! },
    };
    const result = await saveModelRoutingConfig(storage, config);
    setSaveState(result.ok ? 'saved' : 'error');
  }

  if (!loaded) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Models & Keys</h2>
        <p className="text-sm text-muted-foreground">
          Bring your own key — configure a provider for each agent role. Keys are stored locally and
          never leave your browser except to the provider you configure.
        </p>
      </header>

      {ROLES.map(({ role, label }) => {
        const testState = testStates[role];
        return (
          <div key={role} className="space-y-2">
            <ProviderConfigForm
              label={label}
              draft={drafts[role]}
              onChange={(draft) => {
                updateDraft(role, draft);
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={configs[role] === undefined || testState.status === 'testing'}
                onClick={() => void handleTest(role)}
              >
                {testState.status === 'testing' ? 'Testing…' : 'Test connection'}
              </Button>
              {testState.status === 'success' ? (
                <span className="text-xs text-green-700">Connected</span>
              ) : null}
              {testState.status === 'failure' ? (
                <span className="text-xs text-red-600">{testState.message}</span>
              ) : null}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Button
          type="button"
          disabled={!allValid || saveState === 'saving'}
          onClick={() => void handleSave()}
        >
          {saveState === 'saving' ? 'Saving…' : 'Save'}
        </Button>
        {saveState === 'saved' ? <span className="text-xs text-green-700">Saved</span> : null}
        {saveState === 'error' ? (
          <span className="text-xs text-red-600">Failed to save</span>
        ) : null}
        {!allValid ? (
          <span className="text-xs text-muted-foreground">Fill in every role to save.</span>
        ) : null}
      </div>
    </div>
  );
}

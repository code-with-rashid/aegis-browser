import type { SecretVault } from '@aegis/security';
import { toSecretPlaceholder } from '@aegis/security';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

import { isValidSecretName } from './secret-name';

export interface SecretVaultPanelProps {
  readonly vault: SecretVault;
}

type UnlockState =
  { status: 'idle' } | { status: 'unlocking' } | { status: 'error'; message: string };
type AddState = { status: 'idle' } | { status: 'saving' } | { status: 'error'; message: string };

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => undefined);
}

/**
 * Secret vault management (#30): unlock with a passphrase, add/remove named secrets, and
 * show each one's `‹secret:name›` placeholder — the token to reference it in a task, and
 * the concrete proof that the agent only ever sees a placeholder, never the real value.
 */
export function SecretVaultPanel({ vault }: SecretVaultPanelProps): React.JSX.Element {
  const [unlocked, setUnlocked] = useState(vault.isUnlocked);
  const [passphrase, setPassphrase] = useState('');
  const [unlockState, setUnlockState] = useState<UnlockState>({ status: 'idle' });

  const [names, setNames] = useState<readonly string[]>([]);
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);

  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showNewValue, setShowNewValue] = useState(false);
  const [addState, setAddState] = useState<AddState>({ status: 'idle' });

  useEffect(() => {
    if (!unlocked) {
      return;
    }
    vault
      .listSecretNames()
      .then((result) => {
        if (result.ok) {
          setNames([...result.value].sort());
        }
      })
      .catch(() => undefined);
  }, [vault, unlocked]);

  async function refreshNames(): Promise<void> {
    const result = await vault.listSecretNames();
    if (result.ok) {
      setNames([...result.value].sort());
    }
  }

  async function handleUnlock(): Promise<void> {
    setUnlockState({ status: 'unlocking' });
    const result = await vault.unlock(passphrase);
    if (result.ok) {
      setPassphrase('');
      setUnlockState({ status: 'idle' });
      setUnlocked(true);
    } else {
      setUnlockState({ status: 'error', message: result.error.message });
    }
  }

  function handleLock(): void {
    vault.lock();
    setUnlocked(false);
    setNames([]);
  }

  async function handleAdd(): Promise<void> {
    if (!isValidSecretName(newName)) {
      setAddState({
        status: 'error',
        message: 'Use only letters, digits, underscore, or hyphen.',
      });
      return;
    }
    setAddState({ status: 'saving' });
    const result = await vault.setSecret(newName, newValue);
    if (result.ok) {
      setNewName('');
      setNewValue('');
      setAddState({ status: 'idle' });
      await refreshNames();
    } else {
      setAddState({ status: 'error', message: result.error.message });
    }
  }

  async function handleRemove(name: string): Promise<void> {
    const result = await vault.removeSecret(name);
    if (result.ok) {
      setRemoveError(undefined);
      await refreshNames();
    } else {
      setRemoveError(result.error.message);
    }
  }

  if (!unlocked) {
    return (
      <div className="space-y-3 rounded-md border border-border p-3">
        <h2 className="text-lg font-semibold">Secret vault</h2>
        <p className="text-sm text-muted-foreground">
          Credentials are encrypted with a key derived from this passphrase and stored only on this
          device. The agent never sees a secret&apos;s value — only a placeholder token.
        </p>
        <label className="block text-xs text-muted-foreground">
          Passphrase
          <input
            type="password"
            autoComplete="off"
            className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
            value={passphrase}
            onChange={(event) => {
              setPassphrase(event.target.value);
            }}
          />
        </label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={passphrase.length === 0 || unlockState.status === 'unlocking'}
            onClick={() => void handleUnlock()}
          >
            {unlockState.status === 'unlocking' ? 'Unlocking…' : 'Unlock'}
          </Button>
          {unlockState.status === 'error' ? (
            <span className="text-xs text-red-600">{unlockState.message}</span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          First time here? Choosing a passphrase creates a new vault — you&apos;ll need the same one
          to unlock it again later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Secret vault</h2>
          <Button type="button" variant="outline" size="sm" onClick={handleLock}>
            Lock
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          The agent never sees a secret&apos;s value — reference it in a task by its placeholder
          token below; Aegis resolves the real value only at the moment it fills the field.
        </p>

        {names.length === 0 ? (
          <p className="text-sm text-muted-foreground">No secrets stored yet.</p>
        ) : (
          <ul className="space-y-2">
            {names.map((name) => (
              <li
                key={name}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  {toSecretPlaceholder(name)}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    copyToClipboard(toSecretPlaceholder(name));
                  }}
                >
                  Copy
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRemove(name)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {removeError !== undefined ? <p className="text-xs text-red-600">{removeError}</p> : null}
      </section>

      <section className="space-y-2 rounded-md border border-border p-3">
        <h3 className="text-sm font-medium">Add a secret</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-[10rem] flex-1 text-xs text-muted-foreground">
            Name
            <input
              className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
              placeholder="github_password"
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
                setAddState({ status: 'idle' });
              }}
            />
          </label>
          <label className="min-w-[10rem] flex-1 text-xs text-muted-foreground">
            Value
            <div className="mt-1 flex gap-1">
              <input
                type={showNewValue ? 'text' : 'password'}
                autoComplete="off"
                className="block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
                value={newValue}
                onChange={(event) => {
                  setNewValue(event.target.value);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowNewValue((current) => !current);
                }}
              >
                {showNewValue ? 'Hide' : 'Show'}
              </Button>
            </div>
          </label>
          <Button
            type="button"
            size="sm"
            disabled={newName.length === 0 || newValue.length === 0 || addState.status === 'saving'}
            onClick={() => void handleAdd()}
          >
            {addState.status === 'saving' ? 'Saving…' : 'Add'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Adding a name that already exists overwrites its value.
        </p>
        {addState.status === 'error' ? (
          <p className="text-xs text-red-600">{addState.message}</p>
        ) : null}
      </section>
    </div>
  );
}

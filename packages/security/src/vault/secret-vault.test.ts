import { createMemoryStorage } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createSecretVault } from './secret-vault';

describe('createSecretVault', () => {
  it('starts locked', () => {
    const vault = createSecretVault(createMemoryStorage());
    expect(vault.isUnlocked).toBe(false);
  });

  it('bootstraps a fresh vault on first unlock', async () => {
    const vault = createSecretVault(createMemoryStorage());
    const result = await vault.unlock('a new passphrase');

    expect(result.ok).toBe(true);
    expect(vault.isUnlocked).toBe(true);
  });

  it('encrypt -> decrypt round-trips a secret through set/get', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('correct horse battery staple');

    const setResult = await vault.setSecret('github_password', 'hunter2');
    expect(setResult.ok).toBe(true);

    const getResult = await vault.getSecret('github_password');
    expect(getResult).toEqual({ ok: true, value: 'hunter2' });
  });

  it('a wrong passphrase fails safely on an already-initialized vault', async () => {
    const storage = createMemoryStorage();
    const first = createSecretVault(storage);
    await first.unlock('the real passphrase');
    await first.setSecret('api_key', 'sk-real-value');

    const second = createSecretVault(storage);
    const result = await second.unlock('a wrong guess');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('VAULT_WRONG_PASSPHRASE');
    expect(second.isUnlocked).toBe(false);
  });

  it('the correct passphrase unlocks an already-initialized vault and reads its secrets', async () => {
    const storage = createMemoryStorage();
    const first = createSecretVault(storage);
    await first.unlock('the real passphrase');
    await first.setSecret('api_key', 'sk-real-value');

    const second = createSecretVault(storage);
    const unlockResult = await second.unlock('the real passphrase');
    expect(unlockResult.ok).toBe(true);

    const getResult = await second.getSecret('api_key');
    expect(getResult).toEqual({ ok: true, value: 'sk-real-value' });
  });

  it('rejects reading a secret while locked', async () => {
    const vault = createSecretVault(createMemoryStorage());
    const result = await vault.getSecret('anything');
    expect(!result.ok && result.error.code).toBe('VAULT_LOCKED');
  });

  it('rejects writing a secret while locked', async () => {
    const vault = createSecretVault(createMemoryStorage());
    const result = await vault.setSecret('name', 'value');
    expect(!result.ok && result.error.code).toBe('VAULT_LOCKED');
  });

  it('lock() clears the in-memory key so subsequent access requires unlocking again', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('passphrase');
    await vault.setSecret('name', 'value');

    vault.lock();
    expect(vault.isUnlocked).toBe(false);

    const result = await vault.getSecret('name');
    expect(!result.ok && result.error.code).toBe('VAULT_LOCKED');
  });

  it('lock() then unlock() with the correct passphrase restores access to persisted secrets', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('passphrase');
    await vault.setSecret('name', 'value');
    vault.lock();

    const unlockResult = await vault.unlock('passphrase');
    expect(unlockResult.ok).toBe(true);

    const getResult = await vault.getSecret('name');
    expect(getResult).toEqual({ ok: true, value: 'value' });
  });

  it('reports VAULT_SECRET_NOT_FOUND for a name that was never stored', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('passphrase');

    const result = await vault.getSecret('nonexistent');
    expect(!result.ok && result.error.code).toBe('VAULT_SECRET_NOT_FOUND');
  });

  it('lists every stored secret name, and none of their values', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('passphrase');
    await vault.setSecret('github_password', 'hunter2');
    await vault.setSecret('api_key', 'sk-real-value');

    const result = await vault.listSecretNames();
    expect(result.ok).toBe(true);
    expect(result.ok && [...result.value].sort()).toEqual(['api_key', 'github_password']);
  });

  it('removes a secret', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('passphrase');
    await vault.setSecret('name', 'value');

    const removeResult = await vault.removeSecret('name');
    expect(removeResult.ok).toBe(true);

    const getResult = await vault.getSecret('name');
    expect(!getResult.ok && getResult.error.code).toBe('VAULT_SECRET_NOT_FOUND');
  });

  it('removing a never-set secret is a no-op that still succeeds', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('passphrase');

    const result = await vault.removeSecret('never-set');
    expect(result.ok).toBe(true);
  });

  it('overwrites a secret set again under the same name', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('passphrase');
    await vault.setSecret('name', 'first value');
    await vault.setSecret('name', 'second value');

    const result = await vault.getSecret('name');
    expect(result).toEqual({ ok: true, value: 'second value' });
  });

  it("two vault instances over the same storage see each other's writes", async () => {
    const storage = createMemoryStorage();
    const a = createSecretVault(storage);
    await a.unlock('passphrase');
    await a.setSecret('shared_key', 'from a');

    const b = createSecretVault(storage);
    await b.unlock('passphrase');
    await b.setSecret('other_key', 'from b');

    const aSecrets = await a.listSecretNames();
    expect(aSecrets.ok && [...aSecrets.value].sort()).toEqual(['other_key', 'shared_key']);
  });
});

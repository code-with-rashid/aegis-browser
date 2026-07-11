import { createSecretVault, toSecretPlaceholder, type SecretVault } from '@aegis/security';
import { createMemoryStorage } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { resolveStepArgsSecrets } from './resolve-step-secrets';

async function unlockedVault(): Promise<SecretVault> {
  const vault = createSecretVault(createMemoryStorage());
  await vault.unlock('passphrase');
  return vault;
}

describe('resolveStepArgsSecrets', () => {
  it('passes args through unchanged, never touching the vault, when there is no placeholder', async () => {
    const vault = createSecretVault(createMemoryStorage()); // never unlocked
    const args = { type: 'wait', ms: 1 };

    const result = await resolveStepArgsSecrets(args, vault);

    expect(result).toEqual({ ok: true, value: args });
  });

  it('resolves a placeholder in a string field to the real secret value', async () => {
    const vault = await unlockedVault();
    await vault.setSecret('login_password', 'hunter2');
    const args = { type: 'input_text', ref: 'ax:1', text: toSecretPlaceholder('login_password') };

    const result = await resolveStepArgsSecrets(args, vault);

    expect(result).toEqual({
      ok: true,
      value: { type: 'input_text', ref: 'ax:1', text: 'hunter2' },
    });
  });

  it('resolves multiple distinct placeholders anywhere in a nested args object', async () => {
    const vault = await unlockedVault();
    await vault.setSecret('username', 'alice');
    await vault.setSecret('password', 'hunter2');
    const args = {
      type: 'mcp.login',
      credentials: {
        user: toSecretPlaceholder('username'),
        pass: toSecretPlaceholder('password'),
      },
    };

    const result = await resolveStepArgsSecrets(args, vault);

    expect(result).toEqual({
      ok: true,
      value: { type: 'mcp.login', credentials: { user: 'alice', pass: 'hunter2' } },
    });
  });

  it('resolves a placeholder embedded within a larger string', async () => {
    const vault = await unlockedVault();
    await vault.setSecret('code', '123456');
    const args = { type: 'input_text', text: `Use code: ${toSecretPlaceholder('code')}!` };

    const result = await resolveStepArgsSecrets(args, vault);

    expect(result).toEqual({ ok: true, value: { type: 'input_text', text: 'Use code: 123456!' } });
  });

  it('fails with VAULT_LOCKED rather than sending the placeholder literal, when the vault is locked', async () => {
    const vault = createSecretVault(createMemoryStorage()); // never unlocked
    const args = { type: 'input_text', text: toSecretPlaceholder('login_password') };

    const result = await resolveStepArgsSecrets(args, vault);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('VAULT_LOCKED');
  });

  it('fails when the referenced secret does not exist', async () => {
    const vault = await unlockedVault();
    const args = { type: 'input_text', text: toSecretPlaceholder('never_set') };

    const result = await resolveStepArgsSecrets(args, vault);

    expect(result.ok).toBe(false);
  });
});

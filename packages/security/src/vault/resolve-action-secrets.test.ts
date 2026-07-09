import { createMemoryStorage, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { resolveActionSecrets } from './resolve-action-secrets';
import { toSecretPlaceholder } from './secret-placeholder';
import { createSecretVault } from './secret-vault';

async function unlockedVault(secrets: Record<string, string>) {
  const vault = createSecretVault(createMemoryStorage());
  await vault.unlock('passphrase');
  for (const [name, value] of Object.entries(secrets)) {
    await vault.setSecret(name, value);
  }
  return vault;
}

describe('resolveActionSecrets', () => {
  it('resolves a placeholder in input_text to the real secret value', async () => {
    const vault = await unlockedVault({ github_password: 'hunter2' });
    const action = {
      type: 'input_text' as const,
      ref: toElementRef('e1'),
      text: toSecretPlaceholder('github_password'),
    };

    const result = await resolveActionSecrets(action, vault);

    expect(result).toEqual({
      ok: true,
      value: { type: 'input_text', ref: toElementRef('e1'), text: 'hunter2' },
    });
  });

  it('resolves a placeholder embedded within a larger string', async () => {
    const vault = await unlockedVault({ otp_backup_code: '123456' });
    const action = {
      type: 'input_text' as const,
      ref: toElementRef('e1'),
      text: `code: ${toSecretPlaceholder('otp_backup_code')} (backup)`,
    };

    const result = await resolveActionSecrets(action, vault);

    expect(result.ok && result.value.type === 'input_text' && result.value.text).toBe(
      'code: 123456 (backup)',
    );
  });

  it('resolves multiple distinct placeholders in one field', async () => {
    const vault = await unlockedVault({ username: 'alice', password: 'hunter2' });
    const action = {
      type: 'input_text' as const,
      ref: toElementRef('e1'),
      text: `${toSecretPlaceholder('username')}:${toSecretPlaceholder('password')}`,
    };

    const result = await resolveActionSecrets(action, vault);

    expect(result.ok && result.value.type === 'input_text' && result.value.text).toBe(
      'alice:hunter2',
    );
  });

  it('resolves a placeholder in send_keys', async () => {
    const vault = await unlockedVault({ totp_seed: '000111' });
    const action = { type: 'send_keys' as const, keys: toSecretPlaceholder('totp_seed') };

    const result = await resolveActionSecrets(action, vault);

    expect(result.ok && result.value.type === 'send_keys' && result.value.keys).toBe('000111');
  });

  it('passes non-text actions through unchanged', async () => {
    const vault = await unlockedVault({});
    const action = { type: 'click' as const, ref: toElementRef('e1') };

    const result = await resolveActionSecrets(action, vault);

    expect(result).toEqual({ ok: true, value: action });
  });

  it('passes input_text through unchanged when it has no placeholder', async () => {
    const vault = await unlockedVault({});
    const action = { type: 'input_text' as const, ref: toElementRef('e1'), text: 'ordinary text' };

    const result = await resolveActionSecrets(action, vault);

    expect(result).toEqual({ ok: true, value: action });
  });

  it('fails when the referenced secret does not exist', async () => {
    const vault = await unlockedVault({});
    const action = {
      type: 'input_text' as const,
      ref: toElementRef('e1'),
      text: toSecretPlaceholder('nonexistent'),
    };

    const result = await resolveActionSecrets(action, vault);

    expect(!result.ok && result.error.code).toBe('VAULT_SECRET_NOT_FOUND');
  });

  it('fails when the vault is locked', async () => {
    const vault = createSecretVault(createMemoryStorage());
    const action = {
      type: 'input_text' as const,
      ref: toElementRef('e1'),
      text: toSecretPlaceholder('anything'),
    };

    const result = await resolveActionSecrets(action, vault);

    expect(!result.ok && result.error.code).toBe('VAULT_LOCKED');
  });

  it('the real secret value never appears anywhere a model would see (only the placeholder does)', async () => {
    const REAL_PASSWORD = 'correct-horse-battery-staple-9x';
    const vault = await unlockedVault({ github_password: REAL_PASSWORD });

    // What the Navigator actually produces — it only ever knows the placeholder.
    const modelProducedAction = {
      type: 'input_text' as const,
      ref: toElementRef('e1'),
      text: toSecretPlaceholder('github_password'),
    };
    const simulatedModelPrompt = [
      'Fill in the password field.',
      `Proposed action: input_text ${modelProducedAction.text} into "Password"`,
    ].join('\n');

    expect(simulatedModelPrompt).not.toContain(REAL_PASSWORD);
    expect(simulatedModelPrompt).toContain(toSecretPlaceholder('github_password'));

    // Only resolveActionSecrets (called at execution time, after the model's turn is
    // over) ever produces the real value, and only inside the returned Action.
    const result = await resolveActionSecrets(modelProducedAction, vault);
    expect(result.ok && result.value.type === 'input_text' && result.value.text).toBe(
      REAL_PASSWORD,
    );
  });
});

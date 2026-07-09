// @vitest-environment jsdom
import { createSecretVault } from '@aegis/security';
import { createMemoryStorage } from '@aegis/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SecretVaultPanel } from './secret-vault-panel';

describe('SecretVaultPanel', () => {
  it('shows the unlock form when the vault is locked', () => {
    const vault = createSecretVault(createMemoryStorage());
    render(<SecretVaultPanel vault={vault} />);

    expect(screen.getByLabelText('Passphrase')).toBeInTheDocument();
    expect(screen.queryByText('No secrets stored yet.')).not.toBeInTheDocument();
  });

  it('unlocks with a passphrase and reveals the add-secret form', async () => {
    const vault = createSecretVault(createMemoryStorage());
    const user = userEvent.setup();
    render(<SecretVaultPanel vault={vault} />);

    await user.type(screen.getByLabelText('Passphrase'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByText('No secrets stored yet.')).toBeInTheDocument();
  });

  it('a wrong passphrase on an already-initialized vault fails safely', async () => {
    const storage = createMemoryStorage();
    const first = createSecretVault(storage);
    await first.unlock('the real passphrase');

    const vault = createSecretVault(storage);
    const user = userEvent.setup();
    render(<SecretVaultPanel vault={vault} />);

    await user.type(screen.getByLabelText('Passphrase'), 'a wrong guess');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByText(/Incorrect vault passphrase/)).toBeInTheDocument();
  });

  it('adds a secret and shows its placeholder token, never its value', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('correct horse battery staple');
    const user = userEvent.setup();
    render(<SecretVaultPanel vault={vault} />);

    await waitFor(() => {
      expect(screen.getByText('No secrets stored yet.')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Name'), 'github_password');
    await user.type(screen.getByLabelText('Value'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('github_password')).toBeInTheDocument();
    expect(screen.getByText('‹secret:github_password›')).toBeInTheDocument();
    expect(screen.queryByText('hunter2')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('hunter2');
  });

  it('rejects an invalid secret name', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('correct horse battery staple');
    const user = userEvent.setup();
    render(<SecretVaultPanel vault={vault} />);

    await waitFor(() => {
      expect(screen.getByText('No secrets stored yet.')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Name'), 'bad name');
    await user.type(screen.getByLabelText('Value'), 'x');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText(/letters, digits, underscore, or hyphen/)).toBeInTheDocument();
    const result = await vault.listSecretNames();
    expect(result.ok && result.value).toEqual([]);
  });

  it('removes a secret', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('correct horse battery staple');
    await vault.setSecret('github_password', 'hunter2');
    const user = userEvent.setup();
    render(<SecretVaultPanel vault={vault} />);

    await screen.findByText('github_password');
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByText('No secrets stored yet.')).toBeInTheDocument();
    });
  });

  it('masks the new secret value by default, with a Show/Hide toggle', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('correct horse battery staple');
    const user = userEvent.setup();
    render(<SecretVaultPanel vault={vault} />);

    await waitFor(() => {
      expect(screen.getByText('No secrets stored yet.')).toBeInTheDocument();
    });

    const valueInput = screen.getByLabelText('Value');
    expect(valueInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(valueInput).toHaveAttribute('type', 'text');
  });

  it('locking returns to the unlock form', async () => {
    const vault = createSecretVault(createMemoryStorage());
    await vault.unlock('correct horse battery staple');
    const user = userEvent.setup();
    render(<SecretVaultPanel vault={vault} />);

    await waitFor(() => {
      expect(screen.getByText('No secrets stored yet.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Lock' }));

    expect(screen.getByLabelText('Passphrase')).toBeInTheDocument();
    expect(vault.isUnlocked).toBe(false);
  });
});

// @vitest-environment jsdom
import type { PolicyStore } from '@aegis/security';
import type { SitePolicy } from '@aegis/security';
import { ok } from '@aegis/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PermissionsPanel } from './permissions-panel';

function createFakePolicyStore(seed: readonly SitePolicy[] = []): PolicyStore {
  const policies = new Map(seed.map((policy) => [policy.origin, policy]));
  return {
    getPolicy: (origin) => Promise.resolve(ok(policies.get(origin))),
    setPolicy: (policy) => {
      policies.set(policy.origin, policy);
      return Promise.resolve(ok(undefined));
    },
    removePolicy: (origin) => {
      policies.delete(origin);
      return Promise.resolve(ok(undefined));
    },
    listPolicies: () => Promise.resolve(ok([...policies.values()])),
  };
}

describe('PermissionsPanel', () => {
  it('lists existing site policies', async () => {
    const store = createFakePolicyStore([
      { origin: 'https://example.com', mode: 'ask', allowStateChanging: false },
    ]);
    render(<PermissionsPanel store={store} />);

    expect(await screen.findByText('https://example.com')).toBeInTheDocument();
  });

  it('adds a new site policy', async () => {
    const store = createFakePolicyStore();
    const user = userEvent.setup();
    render(<PermissionsPanel store={store} />);

    await waitFor(() => {
      expect(screen.getByText('No site policies configured yet.')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Origin'), 'https://newsite.com');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('https://newsite.com')).toBeInTheDocument();
    const result = await store.listPolicies();
    expect(result.ok && result.value).toEqual([
      { origin: 'https://newsite.com', mode: 'ask', allowStateChanging: false },
    ]);
  });

  it('rejects adding an invalid origin', async () => {
    const store = createFakePolicyStore();
    const user = userEvent.setup();
    render(<PermissionsPanel store={store} />);

    await waitFor(() => {
      expect(screen.getByText('No site policies configured yet.')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Origin'), 'not-a-url');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText(/Enter a valid origin/)).toBeInTheDocument();
    const result = await store.listPolicies();
    expect(result.ok && result.value).toEqual([]);
  });

  it('changing the mode select persists the update immediately', async () => {
    const store = createFakePolicyStore([
      { origin: 'https://example.com', mode: 'ask', allowStateChanging: false },
    ]);
    const user = userEvent.setup();
    render(<PermissionsPanel store={store} />);

    const row = (await screen.findByText('https://example.com')).closest('li');
    if (row === null) {
      throw new Error('row not found');
    }
    await user.selectOptions(within(row).getByLabelText(/Mode/), 'allow');

    await waitFor(async () => {
      const result = await store.getPolicy('https://example.com');
      expect(result.ok && result.value?.mode).toBe('allow');
    });
  });

  it('removes a site policy', async () => {
    const store = createFakePolicyStore([
      { origin: 'https://example.com', mode: 'ask', allowStateChanging: false },
    ]);
    const user = userEvent.setup();
    render(<PermissionsPanel store={store} />);

    await screen.findByText('https://example.com');
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByText('No site policies configured yet.')).toBeInTheDocument();
    });
  });

  it('shows the hard deny-list', async () => {
    const store = createFakePolicyStore();
    render(<PermissionsPanel store={store} />);

    expect(await screen.findByText('chase.com')).toBeInTheDocument();
  });
});

import { createMemoryStorage } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createWebMcpSettingsStore } from './webmcp-settings';

describe('createWebMcpSettingsStore', () => {
  it('defaults to enabled when nothing has been stored yet', async () => {
    const store = createWebMcpSettingsStore(createMemoryStorage());

    const result = await store.getSettings();

    expect(result.ok && result.value).toEqual({ enabled: true });
  });

  it('round-trips a saved setting', async () => {
    const store = createWebMcpSettingsStore(createMemoryStorage());

    expect((await store.setSettings({ enabled: false })).ok).toBe(true);
    const result = await store.getSettings();
    expect(result.ok && result.value).toEqual({ enabled: false });
  });

  it('overwrites a previously saved setting', async () => {
    const store = createWebMcpSettingsStore(createMemoryStorage());
    await store.setSettings({ enabled: false });
    await store.setSettings({ enabled: true });

    const result = await store.getSettings();

    expect(result.ok && result.value).toEqual({ enabled: true });
  });
});

import type { Result, StorageError, StoragePort } from '@aegis/shared';
import { ok } from '@aegis/shared';
import { z } from 'zod';

const WebMcpSettingsSchema = z.object({
  /** Global on/off switch for the WebMCP fast-path (#89) — off means `buildLoopServices` never registers a page's declared tools at all, regardless of what any individual page offers. */
  enabled: z.boolean(),
});
export type WebMcpSettings = z.infer<typeof WebMcpSettingsSchema>;

const WEBMCP_SETTINGS_KEY = 'webmcp-settings';
const DEFAULT_WEBMCP_SETTINGS: WebMcpSettings = { enabled: true };

/** Persisted global WebMCP settings, backed by a {@link StoragePort}. Defaults to enabled — WebMCP is opportunistic, on unless a user turns it off. */
export interface WebMcpSettingsStore {
  getSettings(): Promise<Result<WebMcpSettings, StorageError>>;
  setSettings(settings: WebMcpSettings): Promise<Result<void, StorageError>>;
}

export function createWebMcpSettingsStore(storage: StoragePort): WebMcpSettingsStore {
  return {
    async getSettings() {
      const result = await storage.get(WebMcpSettingsSchema, WEBMCP_SETTINGS_KEY);
      if (!result.ok) {
        return result;
      }
      return ok(result.value ?? DEFAULT_WEBMCP_SETTINGS);
    },

    setSettings(settings) {
      return storage.set(WebMcpSettingsSchema, WEBMCP_SETTINGS_KEY, settings);
    },
  };
}

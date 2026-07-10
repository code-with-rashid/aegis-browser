import { McpServerConnectionConfigSchema, type McpServerConnectionConfig } from '@aegis/mcp';

/**
 * In-progress fields for adding/editing an MCP server. Supports at most one auth header
 * (the common case — a single bearer/API-key header) rather than a dynamic list; a
 * server needing more is a rare enough case not to justify the extra form complexity for
 * this first pass at the UI (#89).
 */
export interface McpServerDraft {
  readonly url: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly authHeaderName: string;
  readonly authHeaderSecretName: string;
}

export const EMPTY_MCP_SERVER_DRAFT: McpServerDraft = {
  url: '',
  name: '',
  enabled: true,
  authHeaderName: '',
  authHeaderSecretName: '',
};

/** Validates a {@link McpServerDraft} into a real {@link McpServerConnectionConfig}, or `undefined` while invalid. */
export function toMcpServerConfig(draft: McpServerDraft): McpServerConnectionConfig | undefined {
  const name = draft.name.trim();
  const headerName = draft.authHeaderName.trim();
  const headerSecretName = draft.authHeaderSecretName.trim();
  const authHeaders =
    headerName.length > 0 && headerSecretName.length > 0
      ? [{ name: headerName, secretName: headerSecretName }]
      : [];

  const parsed = McpServerConnectionConfigSchema.safeParse({
    url: draft.url.trim(),
    name,
    authHeaders,
    enabled: draft.enabled,
  });
  return parsed.success ? parsed.data : undefined;
}

/** The inverse of {@link toMcpServerConfig} — for populating an edit form from a stored config. */
export function draftFromConfig(config: McpServerConnectionConfig): McpServerDraft {
  const header = config.authHeaders[0];
  return {
    url: config.url,
    name: config.name,
    enabled: config.enabled,
    authHeaderName: header?.name ?? '',
    authHeaderSecretName: header?.secretName ?? '',
  };
}

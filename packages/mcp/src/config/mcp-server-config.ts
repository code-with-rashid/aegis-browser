import { z } from 'zod';

/**
 * One auth header an MCP server needs. The header's *value* is never stored here —
 * only `secretName`, a reference into the secret vault (`@aegis/security`) — resolved
 * to a real value at call time only (`resolve-headers.ts`), the same "vault + name
 * reference, never the value" discipline the rest of this codebase already applies to
 * `input_text`/`send_keys` (`docs/adr/0012-secret-vault.md`).
 */
export const McpAuthHeaderConfigSchema = z.object({
  /** The literal HTTP header name, e.g. `"Authorization"`. */
  name: z.string().min(1),
  secretName: z.string().min(1),
});
export type McpAuthHeaderConfig = z.infer<typeof McpAuthHeaderConfigSchema>;

/**
 * A user-configured MCP server. Keyed by `url` (the natural unique key — a user
 * shouldn't configure the same endpoint twice), the same pattern `@aegis/security`'s
 * `SitePolicy` uses for its origin-keyed store.
 */
export const McpServerConnectionConfigSchema = z.object({
  url: z.url(),
  /** User-facing label, shown in the tools/MCP management UI (#89). */
  name: z.string().min(1),
  authHeaders: z.array(McpAuthHeaderConfigSchema).default([]),
  enabled: z.boolean(),
});
export type McpServerConnectionConfig = z.infer<typeof McpServerConnectionConfigSchema>;

export const McpServerConnectionConfigMapSchema = z.record(
  z.string(),
  McpServerConnectionConfigSchema,
);
export type McpServerConnectionConfigMap = z.infer<typeof McpServerConnectionConfigMapSchema>;

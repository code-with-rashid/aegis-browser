import { isErr, ok, type Result } from '@aegis/shared';

import type { McpAuthHeaderConfig } from './mcp-server-config';

/** A plain, structural error shape — deliberately not a class, so this package never needs to import `@aegis/security`'s `VaultError` (siblings don't import each other; see `docs/adr/0010-confirmation-gate.md`'s precedent). */
export interface SecretResolveError {
  readonly message: string;
}

/**
 * Resolves one named secret to its real value. The real implementation (composition
 * root, `apps/extension`) is `(name) => vault.getSecret(name)`; tests can supply a
 * trivial fake. Deliberately a plain function type, not an imported `SecretVault` —
 * `@aegis/mcp` never depends on `@aegis/security` directly.
 */
export type SecretResolver = (secretName: string) => Promise<Result<string, SecretResolveError>>;

/**
 * Resolves every configured auth header's `secretName` to a real value via
 * `resolveSecret`, building the plain `{headerName: value}` map `McpServerConfig.headers`
 * (`client/mcp-client.ts`) expects. Never persists or logs a resolved value — it exists
 * only in the returned map, held only as long as the caller needs it for one connection.
 */
export async function resolveAuthHeaders(
  authHeaders: readonly McpAuthHeaderConfig[],
  resolveSecret: SecretResolver,
): Promise<Result<Record<string, string>, SecretResolveError>> {
  const headers: Record<string, string> = {};
  for (const header of authHeaders) {
    const result = await resolveSecret(header.secretName);
    if (isErr(result)) {
      return result;
    }
    headers[header.name] = result.value;
  }
  return ok(headers);
}

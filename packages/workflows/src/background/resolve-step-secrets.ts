import {
  findSecretPlaceholderNames,
  toSecretPlaceholder,
  type SecretVault,
  type VaultError,
} from '@aegis/security';
import { ok, type Result } from '@aegis/shared';

import { mapStringsDeep } from '../params/map-strings-deep';

/**
 * Resolves every `‹secret:name›` placeholder anywhere in `args` (any `WorkflowStep.args`
 * — a browser action or an arbitrary MCP/WebMCP tool's shape) to its real value via
 * `vault`, for native fill at execution — the generic, `mapStringsDeep`-based equivalent
 * of `@aegis/security`'s `resolveActionSecrets` (which only covers a browser `Action`'s
 * two known free-text fields; a workflow step's args aren't always a browser `Action`).
 * Fails with the vault's own error — locked, or the named secret doesn't exist — rather
 * than ever falling back to the literal placeholder text as if it were a real value
 * (#117: an unresolved secret must stop the run, never leak a placeholder into a form
 * field or an MCP call as if it were the credential).
 */
export async function resolveStepArgsSecrets(
  args: unknown,
  vault: SecretVault,
): Promise<Result<unknown, VaultError>> {
  if (args === undefined) {
    return ok(args);
  }
  const names = findSecretPlaceholderNames(JSON.stringify(args));
  if (names.length === 0) {
    return ok(args);
  }

  const values = new Map<string, string>();
  for (const name of names) {
    const result = await vault.getSecret(name);
    if (!result.ok) {
      return result;
    }
    values.set(name, result.value);
  }

  const resolved = mapStringsDeep(args, (text) => {
    let output = text;
    for (const [name, value] of values) {
      output = output.split(toSecretPlaceholder(name)).join(value);
    }
    return output;
  });
  return ok(resolved);
}

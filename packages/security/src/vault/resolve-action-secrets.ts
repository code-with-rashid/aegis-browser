import type { Action } from '@aegis/actions';
import { isErr, ok, type Result } from '@aegis/shared';

import { findSecretPlaceholderNames, toSecretPlaceholder } from './secret-placeholder';
import type { SecretVault } from './secret-vault';
import type { VaultError } from './vault-errors';

async function resolveText(text: string, vault: SecretVault): Promise<Result<string, VaultError>> {
  const names = findSecretPlaceholderNames(text);
  if (names.length === 0) {
    return ok(text);
  }

  let resolved = text;
  for (const name of names) {
    const secretResult = await vault.getSecret(name);
    if (isErr(secretResult)) {
      return secretResult;
    }
    resolved = resolved.split(toSecretPlaceholder(name)).join(secretResult.value);
  }
  return ok(resolved);
}

/**
 * Resolves any `‹secret:name›` placeholders in `action`'s free-text fields (`input_text`'s
 * `text`, `send_keys`' `keys` — the only action fields a placeholder could appear in) to
 * their real values via `vault`, for native fill at execution. The model that produced
 * `action` only ever saw the placeholder; nothing upstream of this call ever sees the
 * resolved value. Actions with no free-text field (or no placeholder in one) pass through
 * unchanged.
 */
export async function resolveActionSecrets(
  action: Action,
  vault: SecretVault,
): Promise<Result<Action, VaultError>> {
  switch (action.type) {
    case 'input_text': {
      const resolved = await resolveText(action.text, vault);
      if (isErr(resolved)) {
        return resolved;
      }
      return ok({ ...action, text: resolved.value });
    }
    case 'send_keys': {
      const resolved = await resolveText(action.keys, vault);
      if (isErr(resolved)) {
        return resolved;
      }
      return ok({ ...action, keys: resolved.value });
    }
    case 'click':
    case 'scroll':
    case 'navigate':
    case 'go_back':
    case 'open_tab':
    case 'switch_tab':
    case 'close_tab':
    case 'get_dropdown_options':
    case 'select_dropdown_option':
    case 'wait':
    case 'extract':
    case 'done':
      return ok(action);
  }
}

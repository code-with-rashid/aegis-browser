import { AegisError } from '@aegis/shared';

/** Discriminates why a {@link SecretVault} operation failed. */
export type VaultErrorCode =
  'VAULT_LOCKED' | 'VAULT_WRONG_PASSPHRASE' | 'VAULT_STORAGE_FAILED' | 'VAULT_SECRET_NOT_FOUND';

/** Typed error raised by a {@link SecretVault} operation. */
export class VaultError extends AegisError {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

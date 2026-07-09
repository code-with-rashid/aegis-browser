import { err, isErr, ok, type Result, type StoragePort } from '@aegis/shared';
import { z } from 'zod';

import { base64ToBytes, bytesToBase64 } from './base64';
import {
  decryptText,
  deriveVaultKey,
  encryptText,
  generateSalt,
  type EncryptedBlob,
} from './crypto-primitives';
import { VaultError } from './vault-errors';

const EncryptedRecordSchema = z.object({
  ivBase64: z.string(),
  ciphertextBase64: z.string(),
});
type EncryptedRecord = z.infer<typeof EncryptedRecordSchema>;

const PersistedVaultSchema = z.object({
  saltBase64: z.string(),
  /** A known plaintext, encrypted with the derived key — decrypting it on unlock is how a wrong passphrase is detected safely, without ever touching a real secret. */
  canary: EncryptedRecordSchema,
  secrets: z.record(z.string(), EncryptedRecordSchema),
});
type PersistedVault = z.infer<typeof PersistedVaultSchema>;

const VAULT_STORAGE_KEY = 'secret-vault';
const CANARY_PLAINTEXT = 'aegis-vault-canary-v1';

function toEncryptedRecord(blob: EncryptedBlob): EncryptedRecord {
  return { ivBase64: bytesToBase64(blob.iv), ciphertextBase64: bytesToBase64(blob.ciphertext) };
}

function fromEncryptedRecord(record: EncryptedRecord): EncryptedBlob {
  return { iv: base64ToBytes(record.ivBase64), ciphertext: base64ToBytes(record.ciphertextBase64) };
}

/**
 * A WebCrypto-encrypted store for named secrets (`docs/DESIGN.md` §7.4): credentials are
 * encrypted at rest under a key derived from a user passphrase (PBKDF2), and the
 * passphrase itself is never persisted. The vault starts locked every session — call
 * {@link SecretVault.unlock} before storing or retrieving anything.
 *
 * Deliberately has no concept of a rotating/dynamic code (TOTP, SMS OTP) — only static
 * named secrets. There is nothing here a 2FA code could be stored as, so 2FA entry always
 * falls to the human by construction, not by a runtime check (`docs/DESIGN.md` §7.4:
 * "2FA/MFA always hands off to the human").
 */
export interface SecretVault {
  readonly isUnlocked: boolean;
  /**
   * Unlocks the vault with `passphrase`. If no vault has been persisted yet, this
   * bootstraps a fresh one for this passphrase. Otherwise, a wrong passphrase fails with
   * `VAULT_WRONG_PASSPHRASE` — AES-GCM's authentication tag means decrypting with the
   * wrong key never silently returns garbage, so this is safe to rely on.
   */
  unlock(passphrase: string): Promise<Result<void, VaultError>>;
  /** Clears the in-memory derived key. Persisted (encrypted) secrets are untouched. */
  lock(): void;
  setSecret(name: string, value: string): Promise<Result<void, VaultError>>;
  getSecret(name: string): Promise<Result<string, VaultError>>;
  removeSecret(name: string): Promise<Result<void, VaultError>>;
  listSecretNames(): Promise<Result<readonly string[], VaultError>>;
}

interface UnlockedState {
  readonly key: CryptoKey;
  readonly vault: PersistedVault;
}

/** Builds a {@link SecretVault} backed by `storage` — `chrome.storage.local` in production, in-memory in tests. */
export function createSecretVault(storage: StoragePort): SecretVault {
  let derivedKey: CryptoKey | undefined;

  async function readPersisted(): Promise<Result<PersistedVault | undefined, VaultError>> {
    const result = await storage.get(PersistedVaultSchema, VAULT_STORAGE_KEY);
    if (isErr(result)) {
      return err(
        new VaultError('VAULT_STORAGE_FAILED', 'Failed to read the vault', {
          cause: result.error,
        }),
      );
    }
    return ok(result.value);
  }

  async function writePersisted(vault: PersistedVault): Promise<Result<void, VaultError>> {
    const result = await storage.set(PersistedVaultSchema, VAULT_STORAGE_KEY, vault);
    if (isErr(result)) {
      return err(
        new VaultError('VAULT_STORAGE_FAILED', 'Failed to write the vault', {
          cause: result.error,
        }),
      );
    }
    return ok(undefined);
  }

  async function requireUnlocked(): Promise<Result<UnlockedState, VaultError>> {
    if (derivedKey === undefined) {
      return err(new VaultError('VAULT_LOCKED', 'Unlock the vault before accessing secrets'));
    }
    const persistedResult = await readPersisted();
    if (isErr(persistedResult)) {
      return persistedResult;
    }
    if (persistedResult.value === undefined) {
      return err(new VaultError('VAULT_LOCKED', 'Vault is unlocked but has no persisted data'));
    }
    return ok({ key: derivedKey, vault: persistedResult.value });
  }

  return {
    get isUnlocked() {
      return derivedKey !== undefined;
    },

    async unlock(passphrase) {
      const persistedResult = await readPersisted();
      if (isErr(persistedResult)) {
        return persistedResult;
      }

      if (persistedResult.value === undefined) {
        const salt = generateSalt();
        const key = await deriveVaultKey(passphrase, salt);
        const canaryBlob = await encryptText(key, CANARY_PLAINTEXT);
        const writeResult = await writePersisted({
          saltBase64: bytesToBase64(salt),
          canary: toEncryptedRecord(canaryBlob),
          secrets: {},
        });
        if (isErr(writeResult)) {
          return writeResult;
        }
        derivedKey = key;
        return ok(undefined);
      }

      const salt = base64ToBytes(persistedResult.value.saltBase64);
      const key = await deriveVaultKey(passphrase, salt);
      let canaryPlaintext: string;
      try {
        canaryPlaintext = await decryptText(key, fromEncryptedRecord(persistedResult.value.canary));
      } catch (cause) {
        return err(
          new VaultError('VAULT_WRONG_PASSPHRASE', 'Incorrect vault passphrase', { cause }),
        );
      }
      if (canaryPlaintext !== CANARY_PLAINTEXT) {
        return err(new VaultError('VAULT_WRONG_PASSPHRASE', 'Incorrect vault passphrase'));
      }

      derivedKey = key;
      return ok(undefined);
    },

    lock() {
      derivedKey = undefined;
    },

    async setSecret(name, value) {
      const stateResult = await requireUnlocked();
      if (isErr(stateResult)) {
        return stateResult;
      }
      const { key, vault } = stateResult.value;
      const blob = await encryptText(key, value);
      return writePersisted({
        ...vault,
        secrets: { ...vault.secrets, [name]: toEncryptedRecord(blob) },
      });
    },

    async getSecret(name) {
      const stateResult = await requireUnlocked();
      if (isErr(stateResult)) {
        return stateResult;
      }
      const { key, vault } = stateResult.value;
      const record = vault.secrets[name];
      if (record === undefined) {
        return err(new VaultError('VAULT_SECRET_NOT_FOUND', `No secret named "${name}"`));
      }
      const plaintext = await decryptText(key, fromEncryptedRecord(record));
      return ok(plaintext);
    },

    async removeSecret(name) {
      const stateResult = await requireUnlocked();
      if (isErr(stateResult)) {
        return stateResult;
      }
      const { vault } = stateResult.value;
      if (!(name in vault.secrets)) {
        return ok(undefined);
      }
      const nextSecrets = Object.fromEntries(
        Object.entries(vault.secrets).filter(([secretName]) => secretName !== name),
      );
      return writePersisted({ ...vault, secrets: nextSecrets });
    },

    async listSecretNames() {
      const stateResult = await requireUnlocked();
      if (isErr(stateResult)) {
        return stateResult;
      }
      return ok(Object.keys(stateResult.value.vault.secrets));
    },
  };
}

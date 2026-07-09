/**
 * WebCrypto primitives backing the secret vault (`docs/DESIGN.md` §7.4): PBKDF2 key
 * derivation from a user passphrase, and AES-GCM encrypt/decrypt. `crypto.subtle` is a
 * global in both the MV3 service worker and Node (this package's test environment) — no
 * dependency needed.
 */

/** OWASP's 2023 minimum recommendation for PBKDF2-HMAC-SHA256. */
const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH_BYTES = 16;
/** AES-GCM's standard, recommended nonce size. */
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BITS = 256;

export function generateSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
}

function generateIv(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
}

/** Derives a non-extractable AES-GCM key from `passphrase` + `salt` — the passphrase itself is never persisted. */
export async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedBlob {
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly ciphertext: Uint8Array<ArrayBuffer>;
}

/** Encrypts `plaintext` under `key` with a fresh random IV — safe to call repeatedly with the same key. */
export async function encryptText(key: CryptoKey, plaintext: string): Promise<EncryptedBlob> {
  const iv = generateIv();
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)),
  );
  return { iv, ciphertext };
}

/**
 * Decrypts an {@link EncryptedBlob} under `key`. AES-GCM's authentication tag means a
 * wrong key (or tampered ciphertext) makes `crypto.subtle.decrypt` reject rather than
 * silently returning garbage — callers turn that rejection into a typed
 * `VAULT_WRONG_PASSPHRASE`/similar error rather than letting it throw uncaught.
 */
export async function decryptText(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: blob.iv },
    key,
    blob.ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

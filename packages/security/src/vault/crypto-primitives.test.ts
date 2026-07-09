import { describe, expect, it } from 'vitest';

import { decryptText, deriveVaultKey, encryptText, generateSalt } from './crypto-primitives';

describe('crypto-primitives', () => {
  it('round-trips plaintext through encrypt then decrypt with the same key', async () => {
    const salt = generateSalt();
    const key = await deriveVaultKey('correct horse battery staple', salt);

    const blob = await encryptText(key, 'super-secret-value');
    const plaintext = await decryptText(key, blob);

    expect(plaintext).toBe('super-secret-value');
  });

  it('produces a different salt on every call', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toEqual(b);
  });

  it('produces a different ciphertext (fresh IV) on every call, even for the same plaintext', async () => {
    const salt = generateSalt();
    const key = await deriveVaultKey('passphrase', salt);

    const first = await encryptText(key, 'same value');
    const second = await encryptText(key, 'same value');

    expect(first.iv).not.toEqual(second.iv);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
  });

  it('rejects decryption under a key derived from a different passphrase', async () => {
    const salt = generateSalt();
    const rightKey = await deriveVaultKey('right passphrase', salt);
    const wrongKey = await deriveVaultKey('wrong passphrase', salt);

    const blob = await encryptText(rightKey, 'top secret');

    await expect(decryptText(wrongKey, blob)).rejects.toThrow();
  });

  it('derives the same key from the same passphrase and salt', async () => {
    const salt = generateSalt();
    const keyA = await deriveVaultKey('same passphrase', salt);
    const keyB = await deriveVaultKey('same passphrase', salt);

    const blob = await encryptText(keyA, 'value');
    const plaintext = await decryptText(keyB, blob);

    expect(plaintext).toBe('value');
  });
});

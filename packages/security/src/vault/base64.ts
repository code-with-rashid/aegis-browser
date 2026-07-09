/**
 * `chrome.storage`/{@link StoragePort} round-trips values through JSON, which can't carry
 * raw binary — every encrypted blob, salt, and IV is base64-encoded before it's persisted.
 * `btoa`/`atob` operate on binary strings (one code unit per byte), available in both the
 * MV3 service worker and Node (this package's test environment) without a dependency.
 */
export function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

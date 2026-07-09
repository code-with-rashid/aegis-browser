import { describe, expect, it } from 'vitest';

import { base64ToBytes, bytesToBase64 } from './base64';

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 255, 42]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('round-trips an empty byte array', () => {
    const bytes = new Uint8Array([]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('round-trips random-like binary data', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

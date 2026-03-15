import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

vi.mock('../config/index.js', () => ({ getConfig: mocks.getConfig }));

import { encrypt, decrypt } from './encrypt.js';

// Valid 32-byte (256-bit) AES key as hex
const TEST_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

describe('encrypt / decrypt', () => {
  beforeEach(() => {
    mocks.getConfig.mockReturnValue({ ENCRYPTION_KEY: TEST_KEY });
  });

  it('round-trips plaintext correctly', () => {
    const plain = 'secret-bot-token-abc123';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const plain = 'same text';
    const c1 = encrypt(plain);
    const c2 = encrypt(plain);
    expect(c1).not.toBe(c2);
    // Both still decrypt to the same value
    expect(decrypt(c1)).toBe(plain);
    expect(decrypt(c2)).toBe(plain);
  });

  it('ciphertext format is iv:ciphertext:tag (three colon-separated segments)', () => {
    const parts = encrypt('hello').split(':');
    expect(parts).toHaveLength(3);
    const [iv, , tag] = parts;
    expect(iv).toHaveLength(32);   // 16 bytes → 32 hex chars
    expect(tag).toHaveLength(32);  // 16-byte GCM tag → 32 hex chars
  });

  it('throws on authentication tag mismatch (GCM integrity check)', () => {
    const ciphertext = encrypt('original');
    const [iv, body, tag] = ciphertext.split(':');
    // Flip first byte of tag
    const badTag = (parseInt(tag[0], 16) ^ 1).toString(16) + tag.slice(1);
    expect(() => decrypt(`${iv}:${body}:${badTag}`)).toThrow();
  });

  it('throws on truncated / malformed input', () => {
    expect(() => decrypt('notvalid')).toThrow();
  });

  it('handles unicode and long strings', () => {
    const plain = '🤖 Бот-токен: 1234567890:AAHqVeryLongTokenStringHere';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });
});

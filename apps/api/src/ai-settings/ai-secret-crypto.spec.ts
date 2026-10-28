import { randomBytes } from 'node:crypto';
import {
  AiSecretError,
  decryptSecret,
  encryptSecret,
  fingerprintOf,
  isValidEncryptionKey,
  last4Of,
  parseEncryptionKey,
} from './ai-secret-crypto';

const KEY = randomBytes(32);
const SECRET = 'AIzaSyExampleExampleExampleExample_123';

describe('AI key encryption', () => {
  it('accepts exactly 32 random bytes, base64 or base64url, and nothing else', () => {
    const bytes = randomBytes(32);
    expect(parseEncryptionKey(bytes.toString('base64'))?.equals(bytes)).toBe(
      true,
    );
    expect(parseEncryptionKey(bytes.toString('base64url'))?.equals(bytes)).toBe(
      true,
    );
    expect(
      parseEncryptionKey(`  ${bytes.toString('base64')}  `),
    ).not.toBeNull();
    expect(isValidEncryptionKey(bytes.toString('base64'))).toBe(true);

    expect(parseEncryptionKey(randomBytes(31).toString('base64'))).toBeNull();
    expect(parseEncryptionKey(randomBytes(33).toString('base64'))).toBeNull();
    expect(parseEncryptionKey('not base64 at all!')).toBeNull();
    expect(parseEncryptionKey('')).toBeNull();
    expect(parseEncryptionKey(undefined)).toBeNull();
    expect(parseEncryptionKey(null)).toBeNull();
    expect(isValidEncryptionKey('short')).toBe(false);
  });

  it('round-trips a secret, with a fresh IV each time and no plaintext in the stored value', () => {
    const first = encryptSecret(SECRET, KEY);
    const second = encryptSecret(SECRET, KEY);
    expect(first).not.toBe(second);
    expect(first.startsWith('v1:')).toBe(true);
    expect(first.split(':')).toHaveLength(4);
    expect(first).not.toContain(SECRET);
    expect(first).not.toContain(SECRET.slice(0, 12));
    expect(decryptSecret(first, KEY)).toBe(SECRET);
    expect(decryptSecret(second, KEY)).toBe(SECRET);
  });

  it('keeps non-ASCII text intact', () => {
    expect(decryptSecret(encryptSecret('مفتاح-تجريبي-123', KEY), KEY)).toBe(
      'مفتاح-تجريبي-123',
    );
  });

  it('refuses a wrong key', () => {
    const stored = encryptSecret(SECRET, KEY);
    expect(() => decryptSecret(stored, randomBytes(32))).toThrow(AiSecretError);
  });

  it('detects any tampering with the IV, the tag or the data', () => {
    const [version, iv, tag, data] = encryptSecret(SECRET, KEY).split(':');
    const flip = (value: string): string =>
      (value[0] === 'A' ? 'B' : 'A') + value.slice(1);
    expect(() =>
      decryptSecret([version, flip(iv), tag, data].join(':'), KEY),
    ).toThrow(AiSecretError);
    expect(() =>
      decryptSecret([version, iv, flip(tag), data].join(':'), KEY),
    ).toThrow(AiSecretError);
    expect(() =>
      decryptSecret([version, iv, tag, flip(data)].join(':'), KEY),
    ).toThrow(AiSecretError);
  });

  it('refuses unknown or damaged formats', () => {
    expect(() => decryptSecret('', KEY)).toThrow(AiSecretError);
    expect(() => decryptSecret('v2:a:b:c', KEY)).toThrow(AiSecretError);
    expect(() => decryptSecret('v1:a:b', KEY)).toThrow(AiSecretError);
    expect(() => decryptSecret('v1:AAAA:BBBB:CCCC', KEY)).toThrow(
      AiSecretError,
    );
    expect(() => encryptSecret(SECRET, randomBytes(16))).toThrow(AiSecretError);
  });

  it('fingerprints and masks a key without revealing it', () => {
    expect(fingerprintOf(SECRET)).toBe(fingerprintOf(SECRET));
    expect(fingerprintOf(SECRET)).not.toBe(fingerprintOf(`${SECRET}x`));
    expect(fingerprintOf(SECRET)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf(SECRET)).not.toContain(SECRET);
    expect(last4Of(SECRET)).toBe('_123');
  });
});

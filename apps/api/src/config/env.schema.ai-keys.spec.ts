import { randomBytes } from 'node:crypto';
import { validateEnv } from './env.schema';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  CORS_ORIGIN: 'http://localhost:3000',
};

describe('validateEnv -- AI_KEYS_ENCRYPTION_KEY (DEC-059)', () => {
  it('is optional, and an empty value counts as not set', () => {
    expect(validateEnv(BASE).AI_KEYS_ENCRYPTION_KEY).toBeUndefined();
    expect(
      validateEnv({ ...BASE, AI_KEYS_ENCRYPTION_KEY: '' })
        .AI_KEYS_ENCRYPTION_KEY,
    ).toBeUndefined();
    expect(
      validateEnv({ ...BASE, AI_KEYS_ENCRYPTION_KEY: '   ' })
        .AI_KEYS_ENCRYPTION_KEY,
    ).toBeUndefined();
  });

  it('accepts 32 random bytes in base64 or base64url', () => {
    const bytes = randomBytes(32);
    expect(
      validateEnv({ ...BASE, AI_KEYS_ENCRYPTION_KEY: bytes.toString('base64') })
        .AI_KEYS_ENCRYPTION_KEY,
    ).toBe(bytes.toString('base64'));
    expect(
      validateEnv({
        ...BASE,
        AI_KEYS_ENCRYPTION_KEY: bytes.toString('base64url'),
      }).AI_KEYS_ENCRYPTION_KEY,
    ).toBe(bytes.toString('base64url'));
  });

  it.each([
    ['too short', randomBytes(16).toString('base64')],
    ['too long', randomBytes(48).toString('base64')],
    ['not base64', 'this is not a key!'],
  ])(
    'refuses a key that is %s, so a typo fails at startup instead of at the first import',
    (_label, value) => {
      expect(() =>
        validateEnv({ ...BASE, AI_KEYS_ENCRYPTION_KEY: value }),
      ).toThrow(/AI_KEYS_ENCRYPTION_KEY/);
    },
  );
});

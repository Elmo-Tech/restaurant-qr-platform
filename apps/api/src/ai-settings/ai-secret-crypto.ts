import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Encryption of the model API keys saved from the Platform console (DEC-059). AES-256-GCM with a random IV per
 * secret; the key is `AI_KEYS_ENCRYPTION_KEY` (32 random bytes, base64), set once in the server environment and
 * never stored in the database. A stored secret looks like `v1:<iv>:<tag>:<ciphertext>` (base64url parts), so the
 * database alone is not enough to read a key, and any tampering is detected on decryption.
 */

const FORMAT = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
// Binds a ciphertext to this purpose, so it cannot be replayed as some other encrypted value.
const AAD = Buffer.from('wayta:ai-key:v1');

export class AiSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiSecretError';
  }
}

/** 32 random bytes, base64 or base64url encoded. Anything else is not a usable key (null). */
export function parseEncryptionKey(
  value: string | undefined | null,
): Buffer | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) return null;
  const bytes = Buffer.from(text, 'base64');
  return bytes.length === KEY_BYTES ? bytes : null;
}

export function isValidEncryptionKey(value: string): boolean {
  return parseEncryptionKey(value) !== null;
}

const encode = (bytes: Buffer): string => bytes.toString('base64url');
const decode = (text: string): Buffer => Buffer.from(text, 'base64url');

export function encryptSecret(plain: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) throw new AiSecretError('bad encryption key');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  return [
    FORMAT,
    encode(iv),
    encode(cipher.getAuthTag()),
    encode(ciphertext),
  ].join(':');
}

/** Throws `AiSecretError` for a wrong key, a damaged value or an unknown format; never returns garbage. */
export function decryptSecret(stored: string, key: Buffer): string {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT) {
    throw new AiSecretError('unknown secret format');
  }
  const iv = decode(parts[1]);
  const tag = decode(parts[2]);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new AiSecretError('damaged secret');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(decode(parts[3])),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new AiSecretError('could not decrypt (wrong key or damaged value)');
  }
}

/** Identifies a key without decrypting anything: used to refuse the same key twice. */
export function fingerprintOf(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** The only part of a key the console ever shows. */
export function last4Of(secret: string): string {
  return secret.slice(-4);
}

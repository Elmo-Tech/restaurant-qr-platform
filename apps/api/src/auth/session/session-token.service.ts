import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

/** 256-bit raw token (SECURITY_SPEC.md #19: cryptographically random, high entropy, opaque). */
const RAW_TOKEN_BYTES = 32;

/**
 * Canonical representation of a raw token: 32 random bytes, base64url
 * without padding, is always exactly 43 characters from this alphabet.
 * Centralized here so callers never need to know the encoding details.
 */
const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Pure opaque-session-token primitive: generation, hashing, and
 * representation validation only. No Prisma, no HTTP/cookie knowledge, no
 * User/Restaurant concepts.
 *
 * Session tokens are already high-entropy random material, so a fast
 * cryptographic hash (SHA-256) is sufficient here — unlike password hashing,
 * which requires a slow, memory-hard algorithm (Argon2id, a separate,
 * later-controlled slice).
 */
@Injectable()
export class SessionTokenService {
  generateRawToken(): string {
    return randomBytes(RAW_TOKEN_BYTES).toString('base64url');
  }

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Checks only that `value` has the canonical raw-token *shape* (length and
   * alphabet). This is not an authentication check — a well-formed value can
   * still fail to resolve to any session. Callers use this to reject
   * obviously malformed input before ever touching PostgreSQL.
   */
  isWellFormedRawToken(value: string): boolean {
    return typeof value === 'string' && RAW_TOKEN_PATTERN.test(value);
  }
}

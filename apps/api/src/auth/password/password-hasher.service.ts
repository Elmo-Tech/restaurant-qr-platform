import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * V1 password policy (AUTH_TENANCY_SPEC.md #14, SECURITY_SPEC.md #11):
 * minimum 10 characters, recommended maximum 128. No forced composition
 * rules — do not invent uppercase/number/symbol requirements.
 */
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 128;

/**
 * @node-rs/argon2's `Algorithm` is declared as an ambient `const enum`,
 * which TypeScript cannot reference with `isolatedModules: true` (TS2748,
 * required per-file transpilation by ts-jest/nest build). The package's own
 * runtime export is a real object (`Algorithm.Argon2id === 2`), so the
 * documented numeric value is used directly instead of the type-only enum
 * member. This still names Argon2id explicitly, rather than relying on the
 * library's implicit default.
 */
const ARGON2ID: number = 2; // @node-rs/argon2 Algorithm.Argon2id

/**
 * Argon2id password hashing (AUTH_TENANCY_SPEC.md #12, SECURITY_SPEC.md
 * #9-10). Uses @node-rs/argon2's production-safe defaults
 * (memoryCost=19456 KiB, timeCost=2, parallelism=1) unchanged — these match
 * a current OWASP Argon2id baseline configuration exactly. No custom cost
 * parameters, no environment-variable overrides.
 *
 * Pure hashing primitive: no Prisma access, no User lookup, no session
 * creation, no HTTP concerns. The plaintext password is never logged,
 * returned, or included in a thrown error.
 */
@Injectable()
export class PasswordHasherService {
  /**
   * Hashes a plaintext password. The input is used exactly as supplied: it
   * is never trimmed, case-folded, or Unicode-normalized.
   *
   * @throws Error if the password does not satisfy the documented length
   *   policy. The error message never includes the password itself.
   */
  async hashPassword(password: string): Promise<string> {
    if (
      typeof password !== 'string' ||
      password.length < MIN_PASSWORD_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      throw new Error(
        `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
      );
    }

    // Argon2id named explicitly rather than relying only on the library's
    // implicit default, per the approved design.
    return hash(password, { algorithm: ARGON2ID });
  }

  /**
   * Verifies a plaintext password against a stored Argon2 hash. Always
   * resolves to a boolean — a malformed, corrupted, or otherwise
   * unsupported stored hash fails safely (returns false) rather than
   * throwing a raw cryptographic exception.
   */
  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    if (
      typeof password !== 'string' ||
      password.length === 0 ||
      typeof storedHash !== 'string' ||
      storedHash.length === 0
    ) {
      return false;
    }

    try {
      return await verify(storedHash, password, { algorithm: ARGON2ID });
    } catch {
      return false;
    }
  }
}

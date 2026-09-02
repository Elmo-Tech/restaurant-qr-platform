import { randomBytes } from 'node:crypto';

/**
 * Business Foundation L (settled V1 algorithm) / L3: 32 cryptographically
 * random bytes, base64url-encoded (43 characters, no `+`/`/`/`=`).
 * Backend-generated only -- never derived from a Table, Branch, or
 * Restaurant id, and never client-supplied. `qr_codes.public_code`'s
 * database-level `UNIQUE` constraint remains the collision invariant
 * (DATABASE_SPEC.md #54/#75); this helper deliberately has no retry loop.
 */
export function createQrPublicCode(): string {
  return randomBytes(32).toString('base64url');
}

import { randomUUID } from 'node:crypto';

/**
 * Day 1 Menu Vertical Slice, Batch D, explicit decision: generalizes the
 * existing Restaurant/Branch `publicId` convention (`<entity>-<UUIDv4>`,
 * generated entirely on the Backend and independently from the internal
 * `id`) to Product -- `createBranchPublicId`'s own docstring requires a
 * separate, explicit decision before reuse for any other entity, and this
 * is that decision (MENU_SPEC.md #43: Products shown in public guest
 * interfaces may use a safe public identifier). This is a different pattern
 * from `createQrPublicCode` (32 random bytes, base64url) -- that generator
 * exists because a QR code's public value is itself a scannable
 * unguessable secret; a Product's `publicId` is an ordinary stable
 * identifier, not a secret, so the shorter human-legible prefixed-UUID form
 * is appropriate here, matching Restaurant/Branch. The existing
 * `products.public_id` unique constraint remains the final collision
 * invariant (DATABASE_SPEC.md #62) -- no retry loop is introduced.
 */
export function createProductPublicId(): string {
  return `product-${randomUUID()}`;
}

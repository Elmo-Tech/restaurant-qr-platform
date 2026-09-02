import { randomUUID } from 'node:crypto';

/**
 * Business Foundation K, approved decision: Branch-specific `publicId`
 * convention -- `branch-<UUIDv4>`, generated entirely on the Backend and
 * independently from the internal `id` (never derived from it). This is
 * currently a Branch-only convention; it must not be generalized to
 * Restaurant, Product, Order, or any other entity without a separate,
 * explicit decision. The existing `branches.publicId` unique constraint
 * remains the final collision invariant -- no retry loop is introduced.
 */
export function createBranchPublicId(): string {
  return `branch-${randomUUID()}`;
}

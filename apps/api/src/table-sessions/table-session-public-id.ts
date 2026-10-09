import { randomUUID } from 'node:crypto';

/**
 * Table Session `publicId`: `session-<UUIDv4>`, generated on the Backend and
 * independent of the internal `id`. A session-specific convention (like the
 * Branch one in `branches/branch-public-id.ts`, it is not meant to be reused
 * for other entities). The `table_sessions.public_id` unique constraint is the
 * final collision invariant; no retry loop is introduced.
 */
export function createTableSessionPublicId(): string {
  return `session-${randomUUID()}`;
}

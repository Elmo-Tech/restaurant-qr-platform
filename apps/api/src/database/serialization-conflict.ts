import { Prisma } from '../generated/prisma/client';

/**
 * True for a Postgres serialization failure inside a SERIALIZABLE
 * transaction -- the case callers retry. Prisma reports it as `P2034` when it
 * happens mid-transaction, but with the `pg` driver adapter a conflict
 * detected at COMMIT time arrives as a raw `DriverAdapterError` whose message
 * is `TransactionWriteConflict` (never mapped to a known request error). Both
 * mean "retry the whole transaction".
 */
export function isSerializationConflict(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    error.name === 'DriverAdapterError' &&
    error.message === 'TransactionWriteConflict'
  );
}

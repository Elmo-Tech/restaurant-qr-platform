const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks only that `value` has the canonical UUID *shape*. A route
 * identifier that isn't even a well-formed UUID can never match any real
 * row, so callers may safely treat it the same as "not found" without
 * querying the database (and without letting a malformed value reach a
 * `@db.Uuid` column comparison, which PostgreSQL rejects at the SQL level
 * rather than simply returning no rows).
 */
export function isWellFormedUuid(value: string): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

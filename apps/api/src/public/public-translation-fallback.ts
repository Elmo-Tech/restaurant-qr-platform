/** Just the fields a public field-level fallback needs -- never a raw Prisma Translation row (no `id`, no parent entity id). */
export interface PublicTranslatableRow {
  locale: string;
  name: string;
  description: string | null;
}

export interface PublicFieldFallbackResult {
  name: string;
  description: string | null;
}

/**
 * FT-3, Section 9: FIELD-level (never row-level/all-or-nothing) public
 * translation fallback. `name` and `description` are resolved
 * independently:
 *
 * - `name`: the requested-locale translation's name, or the default-locale
 *   translation's name if no requested-locale row exists at all (`name` is
 *   NOT NULL in the schema, so a row that exists always has one).
 * - `description`: the requested-locale translation's description when it
 *   is non-null and non-empty, else the default-locale translation's
 *   description, else `null`.
 *
 * Never invents a translation, never mutates or persists anything (pure
 * function, called only from a read-only public GET). `defaultRow` is
 * assumed to exist -- Batch C/D creation always creates the default-locale
 * translation atomically with its parent entity.
 */
export function resolvePublicField(
  requestedRow: PublicTranslatableRow | undefined,
  defaultRow: PublicTranslatableRow,
): PublicFieldFallbackResult {
  const requestedDescription = requestedRow?.description;
  return {
    name: requestedRow?.name ?? defaultRow.name,
    description:
      requestedDescription !== undefined &&
      requestedDescription !== null &&
      requestedDescription !== ''
        ? requestedDescription
        : (defaultRow.description ?? null),
  };
}

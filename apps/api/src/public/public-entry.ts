import type { PrismaClient } from '../generated/prisma/client';
import { looksLikeSlug } from '../restaurants/restaurant-slug';

/**
 * DEC-066: the Guest URL segment after `/q/` is either a Restaurant's readable slug or an opaque QR
 * public code. A slug only LOOKS UP the Restaurant's own GENERIC QR (the restaurant-level menu); it is
 * never an authorization, and Table QRs are never reachable by slug. Everything after this step runs on
 * the resolved QR public code exactly as before, so every existing rule (active QR, active Restaurant,
 * Branch/Table checks, view-only channels) is unchanged.
 */
export interface ResolvedEntry {
  /** The opaque QR public code the rest of the resolution uses. */
  publicCode: string;
  /** The slug the Guest arrived by, or null when they arrived by a QR code. */
  viaSlug: string | null;
  /** The slug is one the Restaurant no longer uses (renamed): it should redirect to the current one. */
  viaFormerSlug: boolean;
}

export type EntryDb = Pick<PrismaClient, 'restaurantSlug' | 'qrCode'>;

export async function resolveEntry(
  db: EntryDb,
  segment: string,
): Promise<ResolvedEntry> {
  const asCode: ResolvedEntry = {
    publicCode: segment,
    viaSlug: null,
    viaFormerSlug: false,
  };
  // A generated QR public code is 43 characters, a slug at most 40: they can never be confused.
  // (Shorter codes that happen to look like a slug are still found below when no slug matches.)
  if (!looksLikeSlug(segment)) return asCode;

  const row = await db.restaurantSlug.findUnique({
    where: { slug: segment },
    select: { restaurantId: true, isCurrent: true },
  });
  if (!row) return asCode;

  // At most one GENERIC QR exists per Restaurant (unique index); its own status is checked by the caller.
  const generic = await db.qrCode.findFirst({
    where: { restaurantId: row.restaurantId, type: 'GENERIC' },
    select: { publicCode: true },
  });
  if (!generic) return asCode; // a slug with no menu entry resolves like any unknown code
  return {
    publicCode: generic.publicCode,
    viaSlug: segment,
    viaFormerSlug: !row.isCurrent,
  };
}

/** Where a Guest on a legacy or former link should be sent, or null when the URL is already the readable one. */
export function redirectTarget(
  entry: ResolvedEntry,
  qrType: 'TABLE' | 'GENERIC',
  currentSlug: string | null,
): string | null {
  if (qrType !== 'GENERIC' || !currentSlug) return null;
  if (entry.viaSlug === null) return currentSlug; // an old printed/shared /q/{code} link
  return entry.viaFormerSlug ? currentSlug : null; // a renamed link
}

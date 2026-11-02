import {
  ContactValidationError,
  normalizePhone,
  normalizeUrl,
} from '../restaurants/restaurant-contact';

/** Private ElmoTech point of contact, not an auth User or Guest-visible number. */
export interface OwnerContactInput {
  fullName: string;
  phone: string;
  facebookUrl?: string | null;
}

export interface NormalizedOwnerContact {
  fullName: string;
  phone: string;
  facebookUrl: string | null;
}

export type OwnerContactValidation =
  | { ok: true; value: NormalizedOwnerContact | null }
  | { ok: false; problems: string[] };

/**
 * Strict, bounded validation BEFORE provisioning. Optional only for historic
 * Platform clients and CLI onboarding; the new Platform Console form requires it.
 */
export function validateOwnerContact(raw: unknown): OwnerContactValidation {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, problems: ['ownerContact must be an object'] };
  }
  const input = raw as Record<string, unknown>;
  const problems: string[] = [];

  const fullName =
    typeof input.fullName === 'string' ? input.fullName.trim() : '';
  if (fullName.length < 2 || fullName.length > 120) {
    problems.push('ownerContact.fullName must be 2-120 characters');
  }

  let phone: string | null = null;
  if (typeof input.phone !== 'string') {
    problems.push('ownerContact.phone is required');
  } else {
    try {
      phone = normalizePhone('phone', input.phone);
      if (!phone || phone.replace(/\D/g, '').length < 8) {
        problems.push(
          'ownerContact.phone must be a reachable telephone number',
        );
      }
    } catch (error) {
      if (error instanceof ContactValidationError) {
        problems.push('ownerContact.phone is invalid');
      } else {
        throw error;
      }
    }
  }

  let facebookUrl: string | null = null;
  if (
    input.facebookUrl !== undefined &&
    input.facebookUrl !== null &&
    typeof input.facebookUrl !== 'string'
  ) {
    problems.push('ownerContact.facebookUrl must be a URL');
  } else if (typeof input.facebookUrl === 'string') {
    try {
      facebookUrl = normalizeUrl('facebookUrl', input.facebookUrl);
    } catch (error) {
      if (error instanceof ContactValidationError) {
        problems.push(
          'ownerContact.facebookUrl must be a valid Facebook HTTPS URL',
        );
      } else {
        throw error;
      }
    }
  }

  if (problems.length || !phone) return { ok: false, problems };
  return {
    ok: true,
    value: { fullName, phone, facebookUrl },
  };
}

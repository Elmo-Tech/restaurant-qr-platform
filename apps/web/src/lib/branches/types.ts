import type { BranchStatus } from '../auth/types';

/** Mirrors the Backend's Branch list item (`GET /restaurants/:id/branches`). */
export interface BranchItem {
  id: string;
  /** The Restaurant default-locale name (also the legacy single-language value). */
  name: string;
  /** Per-locale display names; always includes the default locale for migrated data. */
  translations: { locale: string; name: string }[];
  status: BranchStatus;
  timezone: string;
  phone: string | null;
  address: string | null;
}

export interface BranchFormValues {
  /** Default-locale name. */
  name: string;
  /** Other active locales: an empty name removes that locale's translation. */
  translations?: { locale: string; name: string }[];
  timezone: string;
  phone: string;
  address: string;
}

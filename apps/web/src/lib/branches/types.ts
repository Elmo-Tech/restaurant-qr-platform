import type { BranchStatus } from '../auth/types';

/** Mirrors the Backend's Branch list item (`GET /restaurants/:id/branches`). */
export interface BranchItem {
  id: string;
  name: string;
  status: BranchStatus;
  timezone: string;
  phone: string | null;
  address: string | null;
}

export interface BranchFormValues {
  name: string;
  timezone: string;
  phone: string;
  address: string;
}
